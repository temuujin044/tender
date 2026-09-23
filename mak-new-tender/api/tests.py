from unittest.mock import Mock, patch

from django.conf import settings
from django.test import SimpleTestCase, override_settings

from api.services.auth_service import MakTenderAuthService


class LoginServiceTests(SimpleTestCase):
    def setUp(self):
        self.service = MakTenderAuthService()
        self.employee = {
            "empid": 2048,
            "empname": "Tender Employee",
            "positionname": "Specialist",
            "email": "employee@mak.mn",
        }

    @override_settings(
        ERP_URL="https://erp.example",
        ERP_DB="mak",
        ERP_AUTH_TIMEOUT=15,
        ERP_VERIFY_SSL=True,
    )
    @patch("api.services.auth_service.requests.post")
    def test_erp_authentication_uses_odoo_session_endpoint(self, post):
        response = Mock()
        response.json.return_value = {"result": {"uid": 99, "employee_id": 2048}}
        post.return_value = response

        result = self.service._authenticate_erp("employee@mak.mn", "erp-secret")

        self.assertEqual(result["employee_id"], 2048)
        post.assert_called_once_with(
            "https://erp.example/web/session/authenticate",
            json={
                "jsonrpc": "2.0",
                "params": {
                    "db": "mak",
                    "login": "employee@mak.mn",
                    "password": "erp-secret",
                },
            },
            headers={"Content-Type": "application/json"},
            timeout=15,
            verify=True,
        )
        response.raise_for_status.assert_called_once_with()

    def test_vendor_uses_tender_password_without_calling_erp(self):
        salt = "vendor-salt"
        tender_user = {
            "userid": 10,
            "username": "vendor",
            "empid": None,
            "empname": "Vendor LLC",
            "positionname": None,
            "vendorid": 25,
            "passwordsalt": salt,
            "passwordhash": self.service.compute_hash(
                "secret",
                salt,
                settings.PASSWORD_PEPPER,
            ),
        }

        with (
            patch.object(self.service, "_find_tender_user", return_value=tender_user),
            patch.object(self.service, "_find_employee") as find_employee,
            patch.object(self.service, "_authenticate_erp") as authenticate_erp,
        ):
            result = self.service.login_service({"username": "vendor", "password": "secret"})

        self.assertEqual(result["success"], 1)
        self.assertEqual(result["role"], "vendor")
        self.assertEqual(result["vendorid"], 25)
        find_employee.assert_not_called()
        authenticate_erp.assert_not_called()

    def test_admin_uses_separate_tender_password_without_calling_erp(self):
        salt = "admin-salt"
        tender_user = {
            "userid": 12,
            "username": "tender.admin@mak.mn",
            "empid": None,
            "empname": "Tender Admin",
            "positionname": "System administrator",
            "vendorid": 0,
            "passwordsalt": salt,
            "passwordhash": self.service.compute_hash(
                "admin-secret",
                salt,
                settings.PASSWORD_PEPPER,
            ),
        }

        with (
            patch.object(self.service, "_find_tender_user", return_value=tender_user),
            patch.object(self.service, "_is_admin_account", return_value=True),
            patch.object(self.service, "_find_employee") as find_employee,
            patch.object(self.service, "_authenticate_erp") as authenticate_erp,
        ):
            result = self.service.login_service(
                {"username": "tender.admin@mak.mn", "password": "admin-secret"}
            )

        self.assertEqual(result["success"], 1)
        self.assertEqual(result["role"], "admin")
        self.assertEqual(result["userid"], 12)
        self.assertIsNone(result["empid"])
        find_employee.assert_not_called()
        authenticate_erp.assert_not_called()

    def test_admin_rejects_invalid_tender_password(self):
        tender_user = {
            "userid": 12,
            "username": "tender.admin@mak.mn",
            "empid": None,
            "empname": "Tender Admin",
            "positionname": "System administrator",
            "vendorid": 0,
            "passwordsalt": "admin-salt",
            "passwordhash": self.service.compute_hash(
                "admin-secret",
                "admin-salt",
                settings.PASSWORD_PEPPER,
            ),
        }
        with (
            patch.object(self.service, "_find_tender_user", return_value=tender_user),
            patch.object(self.service, "_is_admin_account", return_value=True),
            patch.object(self.service, "_authenticate_erp") as authenticate_erp,
        ):
            result = self.service.login_service(
                {"username": "tender.admin@mak.mn", "password": "wrong"}
            )

        self.assertEqual(result["success"], 0)
        authenticate_erp.assert_not_called()

    def test_first_employee_login_creates_tender_user_after_erp_authentication(self):
        with (
            patch.object(self.service, "_find_tender_user", return_value=None),
            patch.object(self.service, "_find_employee", return_value=self.employee),
            patch.object(self.service, "_authenticate_erp", return_value={"uid": 99, "employee_id": 2048}),
            patch.object(self.service, "_find_employee_tender_user", return_value=None),
            patch.object(self.service, "_create_employee_tender_user", return_value=71) as create_user,
        ):
            result = self.service.login_service(
                {"username": "employee@mak.mn", "password": "erp-secret"}
            )

        self.assertEqual(result["success"], 1)
        self.assertEqual(result["role"], "employee")
        self.assertEqual(result["userid"], 71)
        self.assertEqual(result["empid"], 2048)
        self.assertTrue(result["created"])
        create_user.assert_called_once_with("employee@mak.mn", self.employee)

    def test_existing_employee_still_uses_erp_password(self):
        tender_user = {
            "userid": 71,
            "username": "employee@mak.mn",
            "empid": 2048,
            "empname": "Tender Employee",
            "positionname": "Specialist",
            "vendorid": -1,
            "passwordsalt": None,
            "passwordhash": None,
        }

        with (
            patch.object(self.service, "_find_tender_user", return_value=tender_user),
            patch.object(self.service, "_is_admin_account", return_value=False),
            patch.object(self.service, "_find_employee", return_value=self.employee),
            patch.object(self.service, "_authenticate_erp", return_value={"uid": 99, "employee_id": 2048}),
            patch.object(self.service, "_create_employee_tender_user") as create_user,
        ):
            result = self.service.login_service(
                {"username": "employee@mak.mn", "password": "current-erp-secret"}
            )

        self.assertEqual(result["success"], 1)
        self.assertEqual(result["role"], "employee")
        self.assertFalse(result["created"])
        create_user.assert_not_called()

    def test_existing_untyped_user_is_linked_to_employee_after_erp_authentication(self):
        tender_user = {
            "userid": 71,
            "username": "employee@mak.mn",
            "empid": None,
            "empname": "Tender Employee",
            "positionname": "Specialist",
            "vendorid": None,
            "passwordsalt": "old-salt",
            "passwordhash": "old-hash",
        }
        linked_user = {**tender_user, "empid": 2048}

        with (
            patch.object(self.service, "_find_tender_user", return_value=tender_user),
            patch.object(self.service, "_is_admin_account", return_value=False),
            patch.object(self.service, "_find_employee", return_value=self.employee),
            patch.object(self.service, "_authenticate_erp", return_value={"uid": 99}),
            patch.object(
                self.service,
                "_attach_employee_to_tender_user",
                return_value=linked_user,
            ) as attach_employee,
            patch.object(self.service, "_create_employee_tender_user") as create_user,
        ):
            result = self.service.login_service(
                {"username": "employee@mak.mn", "password": "erp-secret"}
            )

        self.assertEqual(result["success"], 1)
        self.assertEqual(result["role"], "employee")
        self.assertEqual(result["empid"], 2048)
        attach_employee.assert_called_once_with(tender_user, self.employee)
        create_user.assert_not_called()

    def test_employee_is_not_created_when_erp_password_is_invalid(self):
        with (
            patch.object(self.service, "_find_tender_user", return_value=None),
            patch.object(self.service, "_find_employee", return_value=self.employee),
            patch.object(self.service, "_authenticate_erp", return_value=None),
            patch.object(self.service, "_create_employee_tender_user") as create_user,
        ):
            result = self.service.login_service(
                {"username": "employee@mak.mn", "password": "wrong"}
            )

        self.assertEqual(result["success"], 0)
        create_user.assert_not_called()
