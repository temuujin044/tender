"""Regression coverage for explicit draft status and legacy NULL repair."""
from importlib import import_module
from unittest.mock import MagicMock, patch

from django.db import IntegrityError, connection, transaction
from django.test import SimpleTestCase, TestCase

from api.models import Tblinvitation
from api.services.tender_service import TenderService


class DraftStatusTests(SimpleTestCase):
    def test_model_defaults_to_draft(self):
        self.assertEqual(Tblinvitation(tender_id=1).status_id, 0)

    @patch("api.services.tender_service.InvitationSerializer")
    @patch("api.services.tender_service.TenderDelaySerializer")
    @patch("api.services.tender_service.Tbltenderdelay")
    @patch("api.services.tender_service.getNextCode", return_value="DRAFT-1")
    @patch("api.services.tender_service.Tbltender")
    @patch("api.services.tender_service.Tblinvitation")
    def test_new_invitation_is_explicitly_draft(self, invitations, tenders, code, delays, delay_serializer, serializer):
        invitations.objects.filter.return_value.filter.return_value.exists.return_value = False
        result = TenderService.save_invitation_header(1, "Employee", 0)
        self.assertEqual(result["retType"], 0)
        self.assertEqual(invitations.objects.create.call_args.kwargs["status_id"], 0)

    @patch("api.services.tender_service.run_service", return_value={"retType": 0})
    @patch("api.services.tender_service.get_users_invitation_ids", return_value="1,2")
    def test_saved_list_handles_null_and_keeps_existing_scope(self, ids, run):
        TenderService.get_invitation_list("employee")
        query, params = run.call_args.args
        self.assertIn("COALESCE(TBLINVITATION.status, 0) AS status_id", query)
        self.assertIn("WHERE COALESCE(TBLINVITATION.status, 0) IN (0,6)", query)
        self.assertIn("LEFT JOIN TBLINVITATIONSTATUS", query)
        self.assertEqual(params, [1, 2])


class DraftMigrationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        with connection.cursor() as cursor:
            cursor.execute("CREATE TABLE tblinvitationstatus (status integer PRIMARY KEY)")
            cursor.execute("INSERT INTO tblinvitationstatus VALUES (0), (1), (6), (10)")
            cursor.execute("CREATE TABLE tblinvitation (invitationid integer PRIMARY KEY, status integer)")
            cursor.execute("INSERT INTO tblinvitation VALUES (1, NULL), (2, 1), (3, 6), (4, 10)")

    def test_repair_preserves_non_draft_statuses_and_prevents_future_nulls(self):
        migration = import_module("api.migrations.0004_invitation_draft_status")
        migration.normalize_draft_status(None, MagicMock(connection=connection))
        with connection.cursor() as cursor:
            cursor.execute("SELECT status FROM tblinvitation ORDER BY invitationid")
            self.assertEqual(cursor.fetchall(), [(0,), (1,), (6,), (10,)])
            cursor.execute("INSERT INTO tblinvitation (invitationid) VALUES (5) RETURNING status")
            self.assertEqual(cursor.fetchone(), (0,))
        with self.assertRaises(IntegrityError), transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("INSERT INTO tblinvitation VALUES (6, NULL)")
        migration.normalize_draft_status(None, MagicMock(connection=connection))

    def test_missing_draft_lookup_fails_without_reclassifying_records(self):
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM tblinvitationstatus WHERE status = 0")
        migration = import_module("api.migrations.0004_invitation_draft_status")
        with self.assertRaisesRegex(RuntimeError, "Missing invitation draft status"):
            migration.normalize_draft_status(None, MagicMock(connection=connection))
        with connection.cursor() as cursor:
            cursor.execute("SELECT status FROM tblinvitation WHERE invitationid = 1")
            self.assertEqual(cursor.fetchone(), (None,))
