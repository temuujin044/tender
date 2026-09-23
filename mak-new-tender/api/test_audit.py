"""Real PostgreSQL regression tests: attribution, transactions and row history."""
from datetime import datetime, timedelta, timezone
from importlib import import_module
from unittest.mock import patch
from uuid import uuid4

import jwt
from django.apps import apps
from django.conf import settings
from django.db import DatabaseError, connection, transaction
from django.http import JsonResponse
from django.test import RequestFactory, TestCase, override_settings
from rest_framework.decorators import api_view
from rest_framework.response import Response

from api.models import AuditChange, AuditEvent, AuditSummary
from api.services.audit_service import audited_business_view
from api.services.tender_service import TenderService


class BusinessAuditTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        # Legacy tables have managed=False. These minimal fixtures exist ONLY
        # in Django's isolated test database and roll back at class teardown.
        with connection.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE tbltenderuser (
                    userid integer PRIMARY KEY, username text, empname text,
                    positionname text, empid integer, vendorid integer
                );
                INSERT INTO tbltenderuser VALUES
                    (1, 'employee', 'Employee Name', 'Buyer', 11, -1),
                    (2, 'supplier', 'Supplier Name', NULL, NULL, 22),
                    (3, 'admin', 'Tender Admin', NULL, NULL, 0);
                CREATE TABLE tblemp (
                    empid integer PRIMARY KEY, empname text, positionname text,
                    email text, image text
                );
                INSERT INTO tblemp VALUES
                    (11, 'ERP Employee Name', 'Senior Buyer', 'employee@mak.mn', NULL),
                    (44, 'ERP Only Employee', 'Accountant', 'erp-only@mak.mn', NULL);
                CREATE TABLE tblaction (
                    id serial PRIMARY KEY, actioncode text, actionname text
                );
                INSERT INTO tblaction VALUES
                    (1, 'Publish', 'Publish tender'),
                    (2, 'TenderEdit', 'Create and edit tender');
                SELECT setval('tblaction_id_seq', 2);
                CREATE TABLE tblmembertype (
                    membertypeid integer PRIMARY KEY, membertypename text
                );
                INSERT INTO tblmembertype VALUES
                    (2, 'Member'),
                    (3, 'Chair');
                CREATE TABLE tbladmin (
                    id serial PRIMARY KEY, empid integer, email text
                );
                INSERT INTO tbladmin (empid, email) VALUES
                    (11, 'employee'),
                    (NULL, 'admin');
                CREATE TABLE tblsettings (
                    id serial PRIMARY KEY, actionid integer, membertypeid integer,
                    empid integer, password text, invitationid integer
                );
                INSERT INTO tblsettings (actionid, membertypeid, empid, password, invitationid)
                    VALUES (1, 2, 11, 'must-never-be-logged', 123);
                CREATE TABLE tblrequire (requireid serial PRIMARY KEY, invitationid integer, requirename text, requiretypeid integer, document_required boolean, visible integer);
                CREATE TABLE tbltender (tenderid integer PRIMARY KEY, tendername text, tendercode text);
                CREATE TABLE tblinvitation (invitationid integer PRIMARY KEY, tenderid integer, acceptdate timestamp, opendate timestamp, description text, note text, status integer);
                CREATE TABLE tblcriteria (criteriaid serial PRIMARY KEY, invitationid integer, joinworkid integer, criteriatypeid integer, criterianame text, weight numeric, visible integer);
                CREATE TABLE tblevaluation (evaluationid serial PRIMARY KEY, invitationid integer, empid integer, empname text, positionname text, roleid integer, createdby text, created timestamp, email text);
            """)
        migration = import_module("api.migrations.0002_business_audit")
        with connection.schema_editor() as editor:
            migration.install_triggers(apps, editor)

    def setUp(self):
        self.factory = RequestFactory()

    def token(self, role="employee", expired=False):
        identity = {
            "employee": (1, "employee", 11, None),
            "vendor": (2, "supplier", None, 22),
            "admin": (3, "admin", None, None),
        }[role]
        return jwt.encode({
            "userid": identity[0],
            "username": identity[1],
            "role": role,
            "empid": identity[2],
            "vendorid": identity[3],
            "exp": datetime.now(timezone.utc) + timedelta(hours=-1 if expired else 1),
        }, settings.SECRET_KEY, algorithm="HS256")

    def request(self, role="employee", token=None):
        return self.factory.post(
            "/api/settings/save/?ip=do-not-store",
            {"currentuser": "spoofed", "userid": 999, "password": "never-store", "ip": "private"},
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer " + (token or self.token(role)),
            HTTP_X_FORWARDED_FOR="192.0.2.1", HTTP_USER_AGENT="private-browser",
        )

    def run_action(self, *, failure=False, exception=False, role="employee"):
        @api_view(["POST"])
        def save_example(request):
            with connection.cursor() as cursor:
                cursor.execute("UPDATE tblsettings SET empid=33 WHERE id=1")
            if exception:
                raise RuntimeError("private error contents")
            return Response({"retType": 1 if failure else 0})
        return audited_business_view(save_example, "settings/save/")(self.request(role))

    def test_committed_change_has_verified_actor_and_real_before_after(self):
        self.assertEqual(self.run_action().status_code, 200)
        event = AuditEvent.objects.get()
        self.assertEqual((event.user_id, event.username, event.role), (1, "Employee Name", "employee"))
        self.assertEqual(event.outcome, "success")
        change = event.changes.get()
        self.assertEqual(change.before["empid"], 11)
        self.assertEqual(change.after["empid"], 33)
        self.assertEqual(change.record_key["invitationid"], 123)
        self.assertEqual(change.after["password"], "[REDACTED]")
        stored = str(list(AuditEvent.objects.values())) + str(list(AuditChange.objects.values()))
        for secret in ("spoofed", "never-store", "must-never-be-logged", "192.0.2.1", "private-browser"):
            self.assertNotIn(secret, stored)
        # Request context must not leak into a later write on a reused connection.
        with connection.cursor() as cursor:
            cursor.execute("UPDATE tblsettings SET empid=44 WHERE id=1")
        self.assertEqual(AuditChange.objects.count(), 1)

    def test_supplier_identity_is_preserved(self):
        self.run_action(role="vendor")
        event = AuditEvent.objects.get()
        self.assertEqual((event.user_id, event.vendor_id, event.role), (2, 22, "vendor"))

    def test_http_200_business_failure_rolls_back_partial_changes(self):
        self.run_action(failure=True)
        self.assertEqual(AuditEvent.objects.get().outcome, "failed")
        self.assertFalse(AuditChange.objects.exists())
        with connection.cursor() as cursor:
            cursor.execute("SELECT empid FROM tblsettings WHERE id=1")
            self.assertEqual(cursor.fetchone()[0], 11)

    def test_exception_rolls_back_and_records_failed_attempt(self):
        with self.assertRaises(RuntimeError):
            self.run_action(exception=True)
        self.assertEqual(AuditEvent.objects.get().status_code, 500)
        self.assertFalse(AuditChange.objects.exists())

    def test_missing_expired_or_forged_token_does_not_execute_mutation(self):
        calls = []
        def save_example(request):
            calls.append(True)
            return JsonResponse({"retType": 0})
        wrapped = audited_business_view(save_example, "settings/save/")
        self.assertEqual(wrapped(self.factory.post("/api/settings/save/")).status_code, 401)
        self.assertEqual(wrapped(self.request(token=self.token(expired=True))).status_code, 401)
        self.assertEqual(wrapped(self.request(token="forged")).status_code, 401)
        self.assertFalse(calls)
        self.assertFalse(AuditEvent.objects.exists())

    def test_audit_storage_failure_prevents_mutation(self):
        with patch.object(AuditEvent.objects, "create", side_effect=DatabaseError("unavailable")):
            with self.assertRaises(DatabaseError):
                self.run_action()
        with connection.cursor() as cursor:
            cursor.execute("SELECT empid FROM tblsettings WHERE id=1")
            self.assertEqual(cursor.fetchone()[0], 11)

    def test_noop_updates_do_not_create_fake_row_changes(self):
        @api_view(["POST"])
        def save_example(request):
            with connection.cursor() as cursor:
                cursor.execute("UPDATE tblsettings SET empid=empid WHERE id=1")
            return Response({"retType": 0})
        audited_business_view(save_example, "settings/save/")(self.request())
        self.assertEqual(AuditEvent.objects.count(), 1)
        self.assertFalse(AuditChange.objects.exists())

    def test_insert_and_delete_capture_correct_sides(self):
        @api_view(["POST"])
        def save_example(request):
            with connection.cursor() as cursor:
                cursor.execute("INSERT INTO tblsettings (id, empid) VALUES (55, 11)")
                cursor.execute("DELETE FROM tblsettings WHERE id=55")
            return Response({"retType": 0})
        audited_business_view(save_example, "settings/save/")(self.request())
        inserted, deleted = list(AuditChange.objects.order_by("id"))
        self.assertIsNone(inserted.before)
        self.assertEqual(inserted.after["id"], 55)
        self.assertEqual(deleted.before["id"], 55)
        self.assertIsNone(deleted.after)

    def test_committed_logs_cannot_be_changed_or_deleted(self):
        self.run_action()
        with self.assertRaisesMessage(DatabaseError, "cannot be edited or deleted"), transaction.atomic():
            AuditEvent.objects.update(username="tampered")
        with self.assertRaisesMessage(DatabaseError, "cannot be edited or deleted"), transaction.atomic():
            AuditChange.objects.all().delete()

    def test_real_settings_routes_share_one_event_per_request(self):
        auth = {"HTTP_AUTHORIZATION": "Bearer " + self.token("admin")}
        response = self.client.post("/api/settings/save/", [
            {"id": 1, "actionid": 2, "empid": 11, "currentuser": "spoofed"},
            {"id": -1, "actionid": 1, "empid": 11},
        ], content_type="application/json", **auth)
        self.assertEqual(response.json()["RetType"], 0)
        self.assertEqual(AuditEvent.objects.count(), 1)
        self.assertEqual(AuditChange.objects.count(), 2)
        self.assertEqual(AuditEvent.objects.get().user_id, 3)
        self.assertEqual(AuditEvent.objects.get().role, "admin")
        self.assertEqual(AuditEvent.objects.get().action, "save_settings_view")
        response = self.client.delete("/api/settings/delete/1/?currentuser=spoofed", **auth)
        self.assertEqual(response.json()["RetType"], 0)
        self.assertEqual(AuditEvent.objects.count(), 2)
        self.assertEqual(AuditChange.objects.filter(operation="delete").count(), 1)

    def test_settings_picker_only_returns_registered_employee_accounts(self):
        result = TenderService.get_settings()

        self.assertEqual(result["RetType"], 0)
        self.assertEqual(
            result["RetData"][3],
            [{
                "id": 1,
                "empid": 11,
                "empname": "ERP Employee Name",
                "positionname": "Senior Buyer",
                "email": "employee@mak.mn",
            }],
        )

    def test_permission_catalog_contains_only_four_business_permissions(self):
        migration = import_module("api.migrations.0008_simplify_permissions")
        migration.configure_permissions(None, type("Editor", (), {"connection": connection})())

        result = TenderService.get_settings()
        self.assertEqual(result["RetType"], 0)
        self.assertEqual(
            [action["actioncode"] for action in result["RetData"][1]],
            ["TenderEdit", "Committee", "Publish", "Cancel"],
        )

    def test_permission_flags_use_simplified_business_permissions(self):
        result = TenderService.get_permission(11)

        self.assertEqual(result["RetType"], 0)
        self.assertEqual(result["RetData"]["isTenderApprove"], 1)
        self.assertEqual(result["RetData"]["isTenderManage"], 0)
        self.assertNotIn("isClose", result["RetData"])

    def test_settings_rejects_erp_only_employee(self):
        result = TenderService.save_settings([{
            "id": -1,
            "actionid": 2,
            "membertypeid": 3,
            "empid": 44,
        }])

        self.assertEqual(result["RetType"], 1)
        self.assertIn("Tender системд ажилтнаар бүртгэлтэй", result["RetMsg"])
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM tblsettings WHERE empid = 44")
            self.assertEqual(cursor.fetchone()[0], 0)

    @override_settings(AUDIT_LOG_VIEWER_USER_IDS={1})
    def test_read_api_permissions_filters_and_details(self):
        self.run_action()
        path = "/api/audit/events/"
        self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(self.client.get(path, HTTP_AUTHORIZATION="Bearer " + self.token("vendor")).status_code, 403)
        auth = {"HTTP_AUTHORIZATION": "Bearer " + self.token()}
        result = self.client.get(path, {"invitation_id": 123}, **auth).json()
        self.assertEqual(result["count"], 1)
        event_id = result["results"][0]["id"]
        result = self.client.get(f"{path}{event_id}/", **auth).json()
        self.assertEqual(result["changes"][0]["after"]["empid"], 33)
        self.assertEqual(self.client.get(path, {"page_size": 101}, **auth).status_code, 400)
        self.assertEqual(self.client.post(path, {}, **auth).status_code, 405)

    def test_login_and_read_requests_are_not_logged(self):
        with patch("api.views.auth_views.auth_service.login_service", return_value={"success": 1}):
            self.client.post("/api/tenderauth/login/", {"username": "employee", "password": "secret"})
        @api_view(["GET"])
        def get_example(request):
            return Response({"retType": 0})
        audited_business_view(get_example, "example/get/")(self.factory.get("/api/example/get/"))
        @api_view(["POST"])
        def get_filtered_example(request):
            return Response({"retType": 0})
        response = audited_business_view(get_filtered_example, "example/filter/")(
            self.factory.post("/api/example/filter/", {}, content_type="application/json")
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(AuditEvent.objects.exists())

    def test_public_registration_still_works_but_profile_edits_require_auth(self):
        with patch("api.views.maktender_views.TenderService.save_vendor", return_value={"ret_type": 0}) as save:
            response = self.client.post("/api/vendor/save/", {"vendorid": 0}, content_type="application/json")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(save.call_count, 1)
            response = self.client.post("/api/vendor/save/", {"vendorid": 22}, content_type="application/json")
            self.assertEqual(response.status_code, 401)
            self.assertEqual(save.call_count, 1)
        self.assertFalse(AuditEvent.objects.exists())

    @override_settings(AUDIT_LOG_VIEWER_USER_IDS={1})
    def test_sidebar_access_is_derived_from_verified_user_not_client_role(self):
        path = "/api/audit/access/"
        self.assertEqual(self.client.get(path).status_code, 401)
        employee = self.client.get(path, HTTP_AUTHORIZATION="Bearer " + self.token())
        self.assertEqual(employee.json(), {"can_view_audit": True})
        self.assertIn("no-store", employee["Cache-Control"])
        supplier = self.client.get(path, {"role": "employee", "user_id": 1},
                                   HTTP_AUTHORIZATION="Bearer " + self.token("vendor"))
        self.assertEqual(supplier.json(), {"can_view_audit": False})
        self.assertFalse(AuditEvent.objects.exists())

    @override_settings(AUDIT_LOG_VIEWER_USER_IDS={3})
    def test_dedicated_admin_can_view_audit_when_env_allows_it(self):
        response = self.client.get(
            "/api/audit/access/",
            HTTP_AUTHORIZATION="Bearer " + self.token("admin"),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"can_view_audit": True})

    @override_settings(AUDIT_LOG_VIEWER_USER_IDS=set())
    def test_unlisted_employee_cannot_open_list_detail_or_legacy_logs(self):
        self.run_action()
        event = AuditEvent.objects.get()
        auth = {"HTTP_AUTHORIZATION": "Bearer " + self.token()}
        self.assertFalse(self.client.get("/api/audit/access/", **auth).json()["can_view_audit"])
        for path in ("/api/audit/events/", f"/api/audit/events/{event.pk}/", "/api/log/all/"):
            self.assertEqual(self.client.get(path, **auth).status_code, 403)

    @override_settings(AUDIT_LOG_VIEWER_USER_IDS={1})
    def test_date_filters_match_ulaanbaatar_calendar_days(self):
        # Midnight in Ulaanbaatar is 16:00 UTC on the preceding day.
        for hour, minute in ((15, 59), (16, 0)):
            AuditEvent.objects.create(
                request_id=uuid4(), occurred_at=datetime(2026, 9, 7, hour, minute, tzinfo=timezone.utc),
                user_id=1, username="Employee Name", role="employee", action="save_example",
                resource="example/save/", outcome="success", status_code=200,
            )
        response = self.client.get("/api/audit/events/", {"date_from": "2026-09-08", "date_to": "2026-09-08"},
                                   HTTP_AUTHORIZATION="Bearer " + self.token())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["count"], 1)

    def save_requirements(self, items):
        from api.views.maktender_views import _sync_portal_requirements
        @api_view(['POST'])
        def save_tender_draft_details_view(request):
            with connection.cursor() as cursor:
                _sync_portal_requirements(cursor, 123, items)
            return Response({'retType': 0})
        # This helper exercises summary projection, not the actual draft HTTP view.
        # Workflow authorization/locking is covered separately in test_workflow.
        with patch('api.services.workflow_service.guard_mutation'):
            return audited_business_view(save_tender_draft_details_view, 'maktender/saveTenderDraftDetails/')(self.request())

    def test_requirement_full_content_is_frozen_and_real_edit_has_before_after(self):
        original = 'Full requirement text with detailed supporting documents.'
        items = [{'id': 'R-new', 'name': original, 'type': 'technical', 'documentRequired': True}]
        self.save_requirements(items)
        first = AuditSummary.objects.get()
        self.assertEqual(first.title, 'Шаардлага нэмсэн')
        self.assertEqual(first.details[0]['after']['Шаардлагын агуулга'], original)
        self.assertEqual(first.details[0]['after']['Баримт хавсаргах'], 'Заавал')
        self.assertNotIn('requireid', str(first.details))
        persisted_id = items[0]['id']
        items[0]['name'] = 'Updated full requirement text.'
        items[0]['documentRequired'] = False
        self.save_requirements(items)
        self.assertEqual(items[0]['id'], persisted_id)
        newest = AuditSummary.objects.order_by('-id').first()
        self.assertEqual(newest.details[0]['operation'], 'update')
        self.assertEqual(newest.details[0]['before']['Шаардлагын агуулга'], original)
        self.assertEqual(newest.details[0]['after']['Баримт хавсаргах'], 'Заавал биш')
        first.refresh_from_db()
        self.assertEqual(first.details[0]['after']['Шаардлагын агуулга'], original)

    def test_unchanged_requirement_save_has_no_visible_log_and_removal_has_content(self):
        items = [{'name': 'Keep exact content', 'type': 'general', 'documentRequired': True}]
        self.save_requirements(items)
        self.save_requirements(items)
        self.assertEqual(AuditSummary.objects.filter(visible=True).count(), 1)
        self.assertEqual(AuditEvent.objects.count(), 2)
        self.save_requirements([])
        detail = AuditSummary.objects.order_by('-id').first().details[0]
        self.assertEqual(detail['operation'], 'delete')
        self.assertEqual(detail['before']['Шаардлагын агуулга'], 'Keep exact content')

    def test_multiple_added_requirements_are_one_summary_and_wrong_invitation_rolls_back(self):
        items = [{'name': name, 'type': 'general', 'documentRequired': True} for name in ('First', 'Second', 'Third')]
        self.save_requirements(items)
        summary = AuditSummary.objects.get()
        self.assertEqual(summary.title, '3 шаардлага нэмсэн')
        self.assertEqual(len(summary.details), 3)
        invalid = [{'id': items[0]['id'], 'name': 'same', 'type': 'general'}, {'id': '999999', 'name': 'wrong'}]
        with self.assertRaises(ValueError):
            self.save_requirements(invalid)
        self.assertEqual(AuditEvent.objects.first().outcome, 'failed')
        with connection.cursor() as cursor:
            cursor.execute('SELECT requirename FROM tblrequire WHERE requireid=%s', [items[0]['id']])
            self.assertEqual(cursor.fetchone()[0], 'First')

    def test_legacy_delete_reinsert_cancels_only_unchanged_multiset(self):
        from types import SimpleNamespace
        from api.services.audit_summary import semantic_details
        old = {'requireid': 1, 'requirename': 'Existing', 'requiretypeid': 54}
        new = {**old, 'requireid': 2}
        changes = [SimpleNamespace(table_name='tblrequire', operation='delete', before=old, after=None),
                   SimpleNamespace(table_name='tblrequire', operation='insert', before=None, after=new),
                   SimpleNamespace(table_name='tblrequire', operation='insert', before=None, after={**new, 'requireid': 3, 'requirename': 'Added'})]
        details = semantic_details(changes)
        self.assertEqual(len(details), 1)
        self.assertEqual(details[0]['after']['Шаардлагын агуулга'], 'Added')

    @override_settings(AUDIT_LOG_VIEWER_USER_IDS={1})
    def test_business_api_omits_technical_columns_and_hides_unchanged_saves(self):
        items = [{'name': 'Visible full text', 'type': 'financial', 'documentRequired': True}]
        self.save_requirements(items)
        self.save_requirements(items)
        auth = {'HTTP_AUTHORIZATION': 'Bearer ' + self.token()}
        response = self.client.get('/api/audit/events/', {'presentation': 'business'}, **auth).json()
        self.assertEqual(response['count'], 1)
        row = response['results'][0]
        result = self.client.get(f"/api/audit/events/{row['id']}/", {'presentation': 'business'}, **auth).json()
        self.assertEqual(result['changes'], [])
        self.assertEqual(result['details'][0]['after']['Шаардлагын агуулга'], 'Visible full text')
        with self.assertRaisesMessage(DatabaseError, 'cannot be edited or deleted'), transaction.atomic():
            AuditSummary.objects.update(title='tampered')

    def test_combined_save_is_one_event_and_failure_rolls_back_header(self):
        def save_header(data):
            with connection.cursor() as cursor:
                cursor.execute("INSERT INTO tbltender VALUES (80, 'Example Tender', 'TN-80')")
            return {'retType': 0, 'retData': 80}
        def invitation_header(tenderid, createdby, invitationid):
            with connection.cursor() as cursor:
                cursor.execute('INSERT INTO tblinvitation (invitationid,tenderid) VALUES (90,80)')
            return {'retType': 0, 'retData': [[{'invitationid': 90, 'invitationcode': 'INV-90'}], []]}
        payload = {'header': {'tenderid': 0, 'tendername': 'Example Tender'}, 'details': {
            'requirements': [{'id': 'R-new', 'name': 'Exact full content', 'type': 'general', 'documentRequired': True}],
            'criteria': [], 'members': [],
        }}
        auth = {'HTTP_AUTHORIZATION': 'Bearer ' + self.token()}
        with patch('api.views.maktender_views.TenderService.save_tender', side_effect=save_header), patch('api.views.maktender_views.TenderService.save_invitation_header', side_effect=invitation_header):
            response = self.client.post('/api/maktender/savePortalTender/', payload, content_type='application/json', **auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AuditEvent.objects.count(), 1)
        self.assertEqual(AuditSummary.objects.get().title, 'Тендерийн ноорог үүсгэсэн')
        self.assertEqual(AuditSummary.objects.get().entity_name, 'Example Tender')
        self.assertTrue(response.json()['retData']['requirements'][0]['id'].isdigit())

        def save_second_header(data):
            with connection.cursor() as cursor:
                cursor.execute("INSERT INTO tbltender VALUES (81, 'Should roll back', 'TN-81')")
            return {'retType': 0, 'retData': 81}
        with patch('api.views.maktender_views.TenderService.save_tender', side_effect=save_second_header), patch('api.views.maktender_views.TenderService.save_invitation_header', return_value={'retType': 1, 'retMsg': 'failed'}):
            self.client.post('/api/maktender/savePortalTender/', payload, content_type='application/json', **auth)
        with connection.cursor() as cursor:
            cursor.execute('SELECT count(*) FROM tbltender WHERE tenderid=81')
            self.assertEqual(cursor.fetchone()[0], 0)
        self.assertEqual(AuditEvent.objects.first().outcome, 'failed')

    def test_empty_new_portal_tender_is_rejected_before_database_write(self):
        payload = {
            'header': {
                'tenderid': 0, 'tendername': '   ', 'tendertypeid': None,
                'purchasetypeid': None, 'departmentid': None, 'budget': '0.0000',
                # The editor initializes this value when the form opens; it is
                # not evidence that the employee entered tender information.
                'publishdate': '2026-09-10', 'batch': [],
            },
            'details': {
                'invitationid': 0, 'acceptdate': None, 'opendate': None,
                'description': '', 'note': '', 'criteria': [],
                'requirements': [], 'members': [],
            },
        }
        auth = {'HTTP_AUTHORIZATION': 'Bearer ' + self.token()}
        with (
            patch('api.views.maktender_views.TenderService.save_tender') as save_tender,
            patch('api.views.maktender_views.TenderService.save_invitation_header') as save_invitation,
        ):
            response = self.client.post(
                '/api/maktender/savePortalTender/', payload,
                content_type='application/json', **auth,
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['retType'], 1)
        save_tender.assert_not_called()
        save_invitation.assert_not_called()
