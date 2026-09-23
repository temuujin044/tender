from django.db import connection
from django.test import TestCase

from api.services.tender_service import TenderService, resolve_vendor_activity


class VendorActivityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        with connection.cursor() as cursor:
            cursor.execute(
                '''
                CREATE TABLE tblvendoractivity (
                    activityid serial PRIMARY KEY,
                    activity varchar(200)
                );
                CREATE TABLE tblvendor (
                    vendorid serial PRIMARY KEY,
                    activity varchar(500)
                );
                CREATE TABLE tbltender (
                    tenderid serial PRIMARY KEY,
                    activityid integer NULL
                );
                INSERT INTO tblvendoractivity(activity) VALUES ('Уул уурхай');
                '''
            )

    def test_registration_activity_is_resolved_only_from_master_data(self):
        with connection.cursor() as cursor:
            self.assertEqual(resolve_vendor_activity(cursor, 1), 'Уул уурхай')
            with self.assertRaisesRegex(ValueError, 'сонгоно уу'):
                resolve_vendor_activity(cursor, None)
            with self.assertRaisesRegex(ValueError, 'олдсонгүй'):
                resolve_vendor_activity(cursor, 999)
        arbitrary = TenderService.save_vendor(
            {'vendorid': 0, 'establisheddate': '', 'activity': 'Дурын бичсэн утга'}
        )
        self.assertEqual(arbitrary['ret_type'], 1)
        self.assertIn('сонгоно уу', arbitrary['ret_msg'])

    def test_admin_can_add_and_rename_activity_with_vendor_cascade(self):
        created = TenderService.save_vendor_activity(
            [{'activityid': -1, 'activity': '  Барилга  '}]
        )
        self.assertEqual(created['ret_type'], 0)
        activity_id = created['ret_data'][0]['activityid']

        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO tblvendor(activity) VALUES ('Барилга')")

        updated = TenderService.save_vendor_activity(
            [{'activityid': activity_id, 'activity': 'Барилга угсралт'}]
        )
        self.assertEqual(updated['ret_type'], 0)
        with connection.cursor() as cursor:
            cursor.execute('SELECT activity FROM tblvendor')
            self.assertEqual(cursor.fetchone()[0], 'Барилга угсралт')

    def test_duplicate_is_rejected_and_used_activity_cannot_be_deleted(self):
        duplicate = TenderService.save_vendor_activity(
            [{'activityid': -1, 'activity': ' уул УУРХАЙ '}]
        )
        self.assertEqual(duplicate['ret_type'], 1)

        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO tblvendor(activity) VALUES ('Уул уурхай')")
        used = TenderService.delete_vendor_activity(1)
        self.assertEqual(used['ret_type'], 1)

        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM tblvendor')
            cursor.execute('INSERT INTO tbltender(activityid) VALUES (1)')
        used_by_tender = TenderService.delete_vendor_activity(1)
        self.assertEqual(used_by_tender['ret_type'], 1)
        self.assertIn('Тендер ашиглаж', used_by_tender['ret_msg'])

        with connection.cursor() as cursor:
            cursor.execute('DELETE FROM tbltender')
        deleted = TenderService.delete_vendor_activity(1)
        self.assertEqual(deleted['ret_type'], 0)
