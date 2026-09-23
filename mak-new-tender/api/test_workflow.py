from datetime import timedelta
from unittest.mock import patch

from django.db import connection, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.test import APIRequestFactory

from api.services.workflow_service import (
    evaluation_invitation_ids,
    guard_mutation,
    require_bid_document_access,
    require_draft,
    require_evaluation_access,
    require_submission,
    transition,
    workflow,
)
from api.views.workflow_views import legacy_transition


class WorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        with connection.cursor() as c:
            c.execute('''
                CREATE TABLE tblinvitation (invitationid serial PRIMARY KEY,tenderid int,status int,
                    acceptdate timestamptz,opendate timestamptz,createdby text,created timestamptz,
                    republish_origin_status int,reissued_from_invitationid int,invitationcode text,note text,openby text,
                    rejectby text,rejectnote text,delaynote text,delayedby text);
                CREATE TABLE tblvendoractivity (activityid serial PRIMARY KEY,activity text);
                CREATE TABLE tbltender (tenderid serial PRIMARY KEY,tendername text,budget numeric,departmentid int,publishdate date,activityid int);
                CREATE TABLE tbltenderuser (userid int,username text,empname text);
                CREATE TABLE tblevaluation (evaluationid serial PRIMARY KEY,invitationid int,empid int,roleid int);
                CREATE TABLE tblcriteria (criteriaid serial PRIMARY KEY,invitationid int,weight text);
                CREATE TABLE tblrequire (requireid serial PRIMARY KEY,invitationid int,requirename text,document_required boolean DEFAULT false);
                CREATE TABLE tbltenderdoc (docid serial PRIMARY KEY,invitationid int,documentname text,batchid int,tenderid int);
                CREATE TABLE tbltenderbatch (
                    batchid serial PRIMARY KEY,
                    tenderid int,
                    batchcode text,
                    batchname text,
                    budget numeric(19,4)
                );
                CREATE TABLE tblqoute (qouteid serial PRIMARY KEY,invitationid int,vendorid int,batchid int);
                CREATE TABLE tblnotes (noteid serial PRIMARY KEY,invitationid int,note text);
                CREATE TABLE tblfiles (fileid serial PRIMARY KEY,sourceid int,sourcetype text,filepath text);
                CREATE TABLE tblvendor (
                    vendorid int,vendorname text,vendorstatusid int,vendoremail text,empemail text
                );
                CREATE TABLE tblinvitationofvendor (id serial PRIMARY KEY,invitationid int,vendorid int,status int,note text,updated text);
                CREATE TABLE tbltenderjoindoc (joindocid serial PRIMARY KEY,invitationid int,vendorid int,batchid int,requiretypeid int);
                CREATE TABLE tblinvevaluate (id serial PRIMARY KEY,empid int,invitationid int,vendorid int,criteriaid int,result numeric,createdby text,created timestamptz);
                INSERT INTO tblvendoractivity(activityid,activity) VALUES (1,'Уул уурхай');
                INSERT INTO tbltender VALUES (1,'Test tender',100,1,NULL,1);
                INSERT INTO tender_activity_relation(tenderid,activityid) VALUES (1,1);
                ALTER TABLE tbltender ADD COLUMN tendertypeid integer DEFAULT 1;
                ALTER TABLE tbltender ADD COLUMN tendercode text DEFAULT 'TENDER-0001';
                SELECT setval('tbltender_tenderid_seq',1);
                INSERT INTO tbltenderuser VALUES (1,'owner','Owner'),(2,'other','Other');
                INSERT INTO tblinvitation(invitationid,tenderid,status,createdby) VALUES (1,1,0,'owner');
                SELECT setval('tblinvitation_invitationid_seq',1);
                INSERT INTO tblevaluation(invitationid,empid,roleid) VALUES (1,11,1),(1,12,2),(1,13,4);
                INSERT INTO tblcriteria(invitationid,weight) VALUES (1,100);
                INSERT INTO tblrequire(invitationid,requirename) VALUES (1,'Original requirement');
                INSERT INTO tbltenderdoc(invitationid,documentname) VALUES (1,'Specification');
                INSERT INTO tblfiles(sourceid,sourcetype,filepath) VALUES (1,'TenderDoc','original.pdf'),(1,'VendorCompanyDoc','private.pdf');
                INSERT INTO tbltenderbatch(tenderid,budget) VALUES (1,100);
                INSERT INTO tblnotes(invitationid,note) VALUES (1,'Contact');
                INSERT INTO tblvendor(vendorid,vendorname,vendorstatusid) VALUES
                    (22,'Vendor',1),(23,'Another vendor',1);
                INSERT INTO tblinvitationofvendor(invitationid,vendorid,status) VALUES (1,22,2),(1,23,2);
            ''')

    def setUp(self):
        self.actor = {'role': 'employee', 'employee_id': 11, 'user_id': 1, 'username': 'Owner'}
        self.vendor = {'role': 'vendor', 'vendor_id': 22}
        self.flags = {
            'isAdmin': 1,
            'isTenderManage': 0,
            'isCommitteeManage': 0,
            'isTenderEvaluate': 0,
            'isTenderApprove': 0,
            'isTenderCancel': 0,
        }
        p = patch('api.services.tender_service.TenderService.get_permission', side_effect=lambda _: {'RetType': 0, 'RetData': self.flags})
        p.start()
        self.addCleanup(p.stop)
        self.dates(timezone.now() + timedelta(days=1))

    def dates(self, accept):
        with connection.cursor() as c:
            c.execute('UPDATE tblinvitation SET acceptdate=%s,opendate=%s WHERE invitationid=1', [accept, accept + timedelta(hours=1)])

    def state(self, value=None):
        with connection.cursor() as c:
            if value is not None:
                c.execute('UPDATE tblinvitation SET status=%s WHERE invitationid=1', [value])
            c.execute('SELECT status FROM tblinvitation WHERE invitationid=1')
            return c.fetchone()[0]

    def act(self, action, **data):
        return transition(self.actor, {'invitationid': 1, 'action': action, **data})

    def test_full_publish_open_decide_finish_lifecycle(self):
        self.act('request_publish')
        self.assertEqual(self.state(), 6)
        self.act('publish')
        self.assertEqual(self.state(), 1)
        self.dates(timezone.now() - timedelta(hours=2))
        self.act('open')
        self.act('decide', vendorid=22, decision=5)
        self.act('decide', vendorid=23, decision=4)
        self.complete_evaluations()
        self.act('finish')
        self.assertEqual(self.state(), 7)

    def test_publish_snapshots_only_matching_email_recipients(self):
        with connection.cursor() as c:
            c.execute(
                "UPDATE tblvendor SET vendoremail='vendor@example.com' WHERE vendorid=22"
            )
            c.execute(
                'INSERT INTO vendor_activity_relation(vendorid,activityid) VALUES (22,1)'
            )
        self.act('request_publish')
        result = self.act('publish')
        self.assertEqual(result['notification_recipient_count'], 1)
        with connection.cursor() as c:
            c.execute(
                'SELECT invitationid,tenderid,vendorid,email,delivery_status '
                'FROM tender_invitation_recipient WHERE invitationid=1'
            )
            self.assertEqual(c.fetchone(), (1, 1, 22, 'vendor@example.com', 'queued'))

    def test_publish_requires_tender_activity(self):
        with connection.cursor() as c:
            c.execute('DELETE FROM tender_activity_relation WHERE tenderid=1')
        with self.assertRaisesRegex(ValidationError, 'үйл ажиллагааны чиглэлийг'):
            self.act('request_publish')

    def test_publish_requires_budget_for_every_batch(self):
        with connection.cursor() as c:
            c.execute('UPDATE tbltenderbatch SET budget=NULL WHERE tenderid=1')
        with self.assertRaisesRegex(ValidationError, 'Багц бүрийн төсөвт үнийг'):
            self.act('request_publish')
        self.assertEqual(self.state(), 0)

    def test_publish_requires_batch_budget_total_to_match_tender_budget(self):
        with connection.cursor() as c:
            c.execute('UPDATE tbltenderbatch SET budget=99 WHERE tenderid=1')
        with self.assertRaisesRegex(ValidationError, 'нийт төсөвтэй тэнцүү'):
            self.act('request_publish')
        self.assertEqual(self.state(), 0)

    def test_tender_specific_document_is_optional_for_publish(self):
        with connection.cursor() as c:
            c.execute('DELETE FROM tbltenderdoc WHERE invitationid=1')
        self.act('request_publish')
        self.assertEqual(self.state(), 6)

    def complete_evaluations(self):
        with connection.cursor() as c:
            c.execute(
                '''
                INSERT INTO tblinvevaluate(empid,invitationid,vendorid,criteriaid,result)
                SELECT member.empid,1,vendor.vendorid,criterion.criteriaid,50
                FROM (SELECT DISTINCT empid FROM tblevaluation WHERE invitationid=1) member
                CROSS JOIN (SELECT vendorid FROM tblinvitationofvendor WHERE invitationid=1) vendor
                CROSS JOIN (SELECT criteriaid FROM tblcriteria WHERE invitationid=1) criterion
                '''
            )

    def test_cannot_skip_approval_or_repeat_action(self):
        with self.assertRaises(ValidationError): self.act('publish')
        self.act('request_publish')
        with self.assertRaises(ValidationError): self.act('request_publish')
        self.assertEqual(self.state(), 6)

    def test_non_admin_cannot_approve(self):
        self.flags['isAdmin'] = 0
        self.flags['isTenderManage'] = 1
        self.act('request_publish')
        with self.assertRaises(PermissionDenied): self.act('publish')
        self.assertEqual(self.state(), 6)

    def test_unrelated_employee_and_vendor_denied(self):
        self.flags['isAdmin'] = 0
        self.flags['isTenderManage'] = 1
        for actor in [self.vendor, {**self.actor, 'user_id': 2, 'employee_id': 99, 'username': 'Other'}]:
            with self.assertRaises(PermissionDenied):
                transition(actor, {'invitationid': 1, 'action': 'request_publish'})

    def test_assigned_publication_permission_can_approve(self):
        self.flags['isAdmin'] = 0
        self.flags['isTenderManage'] = 1
        self.flags['isTenderApprove'] = 1
        self.act('request_publish')
        self.act('publish')
        self.assertEqual(self.state(), 1)

    def test_committee_role_controls_opening_and_final_decisions(self):
        self.flags['isAdmin'] = 0
        self.state(1)
        self.dates(timezone.now() - timedelta(hours=2))
        secretary = {**self.actor, 'user_id': 2, 'employee_id': 12, 'username': 'Other'}

        transition(secretary, {'invitationid': 1, 'action': 'open'})
        with self.assertRaises(PermissionDenied):
            transition(secretary, {
                'invitationid': 1,
                'action': 'decide',
                'vendorid': 22,
                'decision': 5,
            })

    def test_cancel_permission_is_independent(self):
        self.flags['isAdmin'] = 0
        self.flags['isTenderCancel'] = 1
        self.state(1)
        other = {**self.actor, 'user_id': 2, 'employee_id': 99, 'username': 'Other'}

        transition(other, {'invitationid': 1, 'action': 'cancel', 'note': 'Cancelled'})
        self.assertEqual(self.state(), 8)

    def test_submission_after_deadline_or_for_other_vendor_is_denied(self):
        self.state(1)
        with transaction.atomic(): require_submission(self.vendor, 1, 22)
        with self.assertRaises(PermissionDenied), transaction.atomic(): require_submission(self.vendor, 1, 23)
        self.dates(timezone.now() - timedelta(seconds=1))
        with self.assertRaises(ValidationError), transaction.atomic(): require_submission(self.vendor, 1, 22)
        self.state(3)
        with self.assertRaises(ValidationError), transaction.atomic(): require_submission(self.vendor, 1, 22)

    def test_deadline_does_not_itself_open_bids(self):
        self.state(1)
        self.dates(timezone.now() - timedelta(minutes=30))
        with self.assertRaises(ValidationError): self.act('open')
        self.assertEqual(self.state(), 1)

    def test_finish_requires_all_decisions_and_a_winner(self):
        self.state(3)
        with self.assertRaises(ValidationError): self.act('finish')
        with connection.cursor() as c: c.execute('UPDATE tblinvitationofvendor SET status=4')
        with self.assertRaises(ValidationError): self.act('finish')
        self.assertEqual(self.state(), 3)

    def test_finish_requires_every_committee_vendor_and_criterion_score(self):
        self.state(3)
        with connection.cursor() as c:
            c.execute('UPDATE tblinvitationofvendor SET status=4')
            c.execute('UPDATE tblinvitationofvendor SET status=5 WHERE vendorid=22')
            c.execute(
                '''
                INSERT INTO tblinvevaluate(empid,invitationid,vendorid,criteriaid,result)
                SELECT member.empid,1,vendor.vendorid,criterion.criteriaid,50
                FROM (SELECT DISTINCT empid FROM tblevaluation WHERE invitationid=1) member
                CROSS JOIN (SELECT vendorid FROM tblinvitationofvendor WHERE invitationid=1) vendor
                CROSS JOIN (SELECT criteriaid FROM tblcriteria WHERE invitationid=1) criterion
                WHERE NOT (member.empid=13 AND vendor.vendorid=23)
                '''
            )
        with self.assertRaises(ValidationError):
            self.act('finish')
        self.assertEqual(self.state(), 3)

        with connection.cursor() as c:
            c.execute(
                'INSERT INTO tblinvevaluate(empid,invitationid,vendorid,criteriaid,result) VALUES (13,1,23,1,50)'
            )
        self.act('finish')
        self.assertEqual(self.state(), 7)

    def test_decision_cannot_target_other_invitation_or_invalid_status(self):
        self.state(3)
        for data in [{'vendorid': 99, 'decision': 5}, {'vendorid': 22, 'decision': 7}]:
            with self.assertRaises(ValidationError): self.act('decide', note='Decision', **data)

    def test_cancellation_requires_reason_and_allowed_source(self):
        with self.assertRaises(ValidationError): self.act('cancel', note='No bids')
        self.state(1)
        with self.assertRaises(ValidationError): self.act('cancel')
        self.act('cancel', note='Requirement withdrawn')
        self.assertEqual(self.state(), 8)
        with connection.cursor() as c:
            c.execute('SELECT rejectnote FROM tblinvitation WHERE invitationid=1')
            self.assertEqual(c.fetchone()[0], 'Requirement withdrawn')

    def test_returned_requests_restore_correct_state(self):
        self.state(6)
        self.act('return_draft')
        self.assertEqual(self.state(), 0)
        for old in (7, 8):
            self.state(old)
            self.act('request_republish')
            self.assertEqual(self.state(), 9)
            self.act('return_republish')
            self.assertEqual(self.state(), old)

    def test_extend_preserves_submissions_and_cannot_shorten_deadline(self):
        self.state(1)
        with self.assertRaises(ValidationError):
            self.act('extend', note='Change', acceptdate=timezone.now().isoformat(), opendate=(timezone.now()+timedelta(hours=1)).isoformat())
        self.act('extend', acceptdate=(timezone.now()+timedelta(days=2)).isoformat(), opendate=(timezone.now()+timedelta(days=3)).isoformat())
        with connection.cursor() as c:
            c.execute('SELECT status FROM tblinvitationofvendor ORDER BY id')
            self.assertEqual(c.fetchall(), [(2,), (2,)])

    def test_status_transition_does_not_clear_tender_note(self):
        with connection.cursor() as c:
            c.execute("UPDATE tblinvitation SET note='Tender content' WHERE invitationid=1")
        self.act('request_publish')
        with connection.cursor() as c:
            c.execute('SELECT note FROM tblinvitation WHERE invitationid=1')
            self.assertEqual(c.fetchone()[0], 'Tender content')

    @patch('api.utils.mime_types.getNextCode', return_value='NEW-ROUND')
    def test_republish_copies_requirements_and_docs_but_not_bids(self, _):
        self.state(8)
        self.act('request_republish', note='New round')
        # Production's migrated legacy tables have sequences but no PK
        # constraints, so introspection returns None for every copied table.
        with patch.object(connection.introspection, 'get_primary_key_column', return_value=None):
            new_id = self.act('republish')['new_invitationid']
        self.assertEqual(self.state(), 10)
        with connection.cursor() as c:
            c.execute('SELECT status,acceptdate,opendate,createdby FROM tblinvitation WHERE invitationid=%s', [new_id])
            self.assertEqual(c.fetchone(), (0, None, None, 'owner'))
            c.execute('SELECT count(*) FROM tblinvitationofvendor WHERE invitationid=%s', [new_id])
            self.assertEqual(c.fetchone()[0], 0)
            c.execute('SELECT requirename FROM tblrequire WHERE invitationid=%s', [new_id])
            self.assertEqual(c.fetchone()[0], 'Original requirement')
            c.execute('SELECT count(*) FROM tblfiles')
            self.assertEqual(c.fetchone()[0], 3)
            c.execute('SELECT tenderid,reissued_from_invitationid FROM tblinvitation WHERE invitationid=%s', [new_id])
            tender_id, source = c.fetchone()
            self.assertNotEqual(tender_id, 1)
            self.assertEqual(source, 1)
            c.execute(
                'SELECT activityid FROM tender_activity_relation WHERE tenderid=%s',
                [tender_id],
            )
            self.assertEqual(c.fetchall(), [(1,)])

    @patch('api.utils.mime_types.getNextCode', side_effect=['', 'INVITATION-NEW'])
    def test_republish_uses_traceable_code_when_type_counter_is_missing(self, _):
        self.state(8)
        self.act('request_republish')
        with patch.object(connection.introspection, 'get_primary_key_column', return_value=None):
            new_id = self.act('republish')['new_invitationid']
        with connection.cursor() as c:
            c.execute(
                'SELECT t.tendercode,i.invitationcode FROM tblinvitation i '
                'JOIN tbltender t ON t.tenderid=i.tenderid WHERE i.invitationid=%s',
                [new_id],
            )
            self.assertEqual(c.fetchone(), ('TENDER-0001-R1', 'INVITATION-NEW'))

    @patch('api.services.workflow_service.clone_rows', side_effect=RuntimeError('Copy failed'))
    @patch('api.utils.mime_types.getNextCode', return_value='NEW-ROUND')
    def test_failed_republish_rolls_back_old_status_and_new_draft(self, *_):
        self.state(8)
        self.act('request_republish', note='New round')
        with self.assertRaises(RuntimeError): self.act('republish')
        self.assertEqual(self.state(), 9)
        with connection.cursor() as c:
            c.execute('SELECT count(*) FROM tblinvitation')
            self.assertEqual(c.fetchone()[0], 1)

    def test_published_tender_edit_is_locked(self):
        with transaction.atomic(): require_draft(self.actor, 1)
        self.state(6)
        with self.assertRaises(ValidationError), transaction.atomic(): require_draft(self.actor, 1)

    def test_draft_edit_and_committee_management_are_separate_permissions(self):
        self.flags['isAdmin'] = 0
        self.flags['isTenderManage'] = 1
        with transaction.atomic():
            require_draft(self.actor, 1)
        with self.assertRaises(PermissionDenied), transaction.atomic():
            require_draft(self.actor, 1, 'isCommitteeManage')

        self.flags['isTenderManage'] = 0
        self.flags['isCommitteeManage'] = 1
        with self.assertRaises(PermissionDenied), transaction.atomic():
            require_draft(self.actor, 1)
        with transaction.atomic():
            require_draft(self.actor, 1, 'isCommitteeManage')

    def test_committee_save_route_requires_committee_permission(self):
        self.flags['isAdmin'] = 0
        payload = {
            'invitationid': 1,
            'members': [{'empid': 11, 'role': 'chair'}],
        }
        request = APIRequestFactory().post('/', payload, format='json')
        request.audit_actor = self.actor

        with self.assertRaises(PermissionDenied):
            guard_mutation(request, 'maktender/saveTenderCommittee/')
        self.flags['isCommitteeManage'] = 1
        guard_mutation(request, 'maktender/saveTenderCommittee/')

    def test_evaluation_permission_also_requires_committee_assignment(self):
        self.flags['isAdmin'] = 0
        self.state(3)
        evaluator = {**self.actor, 'user_id': 2, 'employee_id': 99, 'username': 'Other'}
        with self.assertRaises(PermissionDenied):
            require_evaluation_access(evaluator, 1)

        self.flags['isTenderEvaluate'] = 1
        with self.assertRaises(PermissionDenied):
            require_evaluation_access(evaluator, 1)
        self.assertEqual(evaluation_invitation_ids(evaluator), [])

        evaluator['employee_id'] = 12
        require_evaluation_access(evaluator, 1)
        self.assertEqual(evaluation_invitation_ids(evaluator), [1])
        with connection.cursor() as c:
            c.execute('UPDATE tblinvitationofvendor SET status=3')
        request = APIRequestFactory().post(
            '/',
            {
                'empid': 12,
                'param': [{
                    'invitationid': 1,
                    'vendorid': 22,
                    'criteriaid': 1,
                    'result': 50,
                }],
            },
            format='json',
        )
        request.audit_actor = evaluator
        guard_mutation(request, 'maktender/evalueteInvitationOfVendor/')

    def test_bid_documents_stay_sealed_until_deadline_and_opening(self):
        self.state(3)
        with self.assertRaisesRegex(ValidationError, 'хугацаа дуусаагүй'):
            require_bid_document_access(self.actor, 1)
        self.dates(timezone.now() - timedelta(hours=2))
        require_bid_document_access(self.actor, 1)

    def test_quote_requires_every_standard_document_when_requested(self):
        self.state(1)
        with connection.cursor() as c:
            c.execute('UPDATE tblrequire SET document_required=true WHERE invitationid=1')
        request = APIRequestFactory().post(
            '/',
            {'invitationid': 1, 'tenderid': 1, 'vendorid': 22, 'batchid': 1},
            format='json',
        )
        request.audit_actor = self.vendor
        with self.assertRaisesRegex(ValidationError, 'бүрдүүлэлт дутуу'):
            guard_mutation(request, 'quote/save/')
        with connection.cursor() as c:
            c.executemany(
                'INSERT INTO tbltenderjoindoc(invitationid,vendorid,batchid,requiretypeid) VALUES (1,22,99,%s)',
                [(1001,), (1002,), (1003,), (1004,)],
            )
        guard_mutation(request, 'quote/save/')

    def test_legacy_publish_cannot_bypass_state_rule(self):
        request = APIRequestFactory().post('/', {'invitationid': 1}, format='json')
        request.audit_actor = self.actor
        response = legacy_transition('publish')(request)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.state(), 0)

    def test_available_actions_reflect_permissions(self):
        self.state(6)
        self.flags['isAdmin'] = 0
        self.assertEqual(workflow(self.actor, 1)['actions'], [])
        self.flags['isAdmin'] = 1
        self.assertIn('publish', workflow(self.actor, 1)['actions'])

    def test_submissions_are_counted_by_batch_without_revealing_names_before_open(self):
        self.state(1)
        with connection.cursor() as c:
            c.execute('SELECT batchid FROM tbltenderbatch WHERE tenderid=1')
            batch_id = c.fetchone()[0]
            c.executemany(
                'INSERT INTO tblqoute(invitationid,vendorid,batchid) VALUES (1,%s,%s)',
                [(22, batch_id), (22, batch_id), (23, batch_id)],
            )

        secretary = {
            'role': 'employee',
            'employee_id': 12,
            'user_id': 2,
            'username': 'Other',
        }
        sealed = workflow(secretary, 1)
        self.assertTrue(sealed['identitiesSealed'])
        self.assertEqual(sealed['vendors'], [])
        self.assertEqual(sealed['submissionSummary']['totalCompanies'], 2)
        self.assertEqual(sealed['submissionSummary']['batches'][0]['companyCount'], 2)

        self.state(3)
        opened = workflow(secretary, 1)
        self.assertFalse(opened['identitiesSealed'])
        self.assertEqual({vendor['name'] for vendor in opened['vendors']}, {'Vendor', 'Another vendor'})

    def test_legacy_out_of_range_dates_do_not_break_workflow_reads(self):
        for invalid_date in ('0001-12-31 16:52:28+00 BC', 'infinity', '-infinity', '10000-01-01 00:00:00+00'):
            with self.subTest(date=invalid_date):
                with connection.cursor() as c:
                    c.execute('UPDATE tblinvitation SET opendate=%s::timestamptz WHERE invitationid=1', [invalid_date])
                self.assertIsNone(workflow(self.actor, 1)['opendate'])
                with self.assertRaises(ValidationError):
                    self.act('request_publish')
                self.assertEqual(self.state(), 0)
