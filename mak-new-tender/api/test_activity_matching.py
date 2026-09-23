from django.core import mail
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone

from api.models import TenderInvitationRecipient
from api.services.activity_matching_service import (
    queue_activity_invitations,
    send_pending_invitation_emails,
    sync_tender_activities,
    sync_vendor_activities,
)


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEFAULT_FROM_EMAIL='no-reply@example.com',
    TENDER_PUBLIC_URL='https://tender.example.com',
)
class ActivityMatchingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        with connection.cursor() as cursor:
            cursor.execute(
                '''
                CREATE TABLE tblvendoractivity (
                    activityid serial PRIMARY KEY,
                    activity text
                );
                CREATE TABLE tblvendor (
                    vendorid int PRIMARY KEY,
                    vendorname text,
                    vendorstatusid int,
                    vendoremail text,
                    empemail text
                );
                CREATE TABLE tbltender (
                    tenderid int PRIMARY KEY,
                    tendername text
                );
                CREATE TABLE tblinvitation (
                    invitationid int PRIMARY KEY,
                    tenderid int,
                    invitationcode text,
                    acceptdate timestamptz,
                    status int
                );
                INSERT INTO tblvendoractivity(activityid,activity)
                    VALUES (1,'Mining'),(2,'Transport');
                INSERT INTO tblvendor(vendorid,vendorname,vendorstatusid,vendoremail,empemail)
                    VALUES
                    (11,'Matched vendor',1,'matched@example.com',''),
                    (12,'Other vendor',1,'other@example.com',''),
                    (13,'Inactive vendor',0,'inactive@example.com','');
                INSERT INTO tbltender(tenderid,tendername) VALUES (101,'Matched tender');
                INSERT INTO tblinvitation(invitationid,tenderid,invitationcode,acceptdate,status)
                    VALUES (201,101,'INV-201',%s,1);
                ''',
                [timezone.now()],
            )
            sync_vendor_activities(cursor, 11, [1])
            sync_vendor_activities(cursor, 12, [2])
            sync_vendor_activities(cursor, 13, [1])
            sync_tender_activities(cursor, 101, [1])

    def test_only_active_matching_vendor_is_snapshotted_and_emailed(self):
        with connection.cursor() as cursor:
            self.assertEqual(queue_activity_invitations(cursor, 201, 101), 1)
            self.assertEqual(queue_activity_invitations(cursor, 201, 101), 0)

        recipient = TenderInvitationRecipient.objects.get(invitationid=201)
        self.assertEqual(recipient.vendorid, 11)
        self.assertEqual(recipient.matched_activity_ids, [1])

        result = send_pending_invitation_emails(201)
        recipient.refresh_from_db()
        self.assertEqual(result, {'sent': 1, 'failed': 0})
        self.assertEqual(recipient.delivery_status, 'sent')
        self.assertEqual(recipient.attempt_count, 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('https://tender.example.com/tenders/201', mail.outbox[0].body)
