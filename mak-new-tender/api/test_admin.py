from unittest.mock import patch

from django.http import JsonResponse
from django.test import RequestFactory, SimpleTestCase
from rest_framework.test import APIRequestFactory

from api.services.admin_service import database_admin_required
from api.views import admin_views, workflow_views


ADMIN = {
    "user_id": 3,
    "username": "Tender Admin",
    "role": "admin",
    "employee_id": None,
    "vendor_id": None,
}


class AdminAccessTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    @patch("api.views.admin_views.admin_capabilities")
    @patch("api.views.admin_views.verified_actor", return_value=ADMIN)
    def test_access_returns_independent_capabilities(self, _actor, capabilities):
        capabilities.return_value = {
            "can_access_admin": True,
            "can_manage_settings": False,
            "can_view_audit": True,
        }
        response = admin_views.access(self.factory.get("/api/admin/access/"))
        self.assertEqual(response.status_code, 200)
        self.assertJSONEqual(
            response.content,
            {
                "can_access_admin": True,
                "can_manage_settings": False,
                "can_view_audit": True,
            },
        )
        self.assertEqual(response["Cache-Control"], "private, no-store")

    @patch("api.views.admin_views.verified_actor", side_effect=ValueError)
    def test_access_requires_authentication(self, _actor):
        response = admin_views.access(self.factory.get("/api/admin/access/"))
        self.assertEqual(response.status_code, 401)


class DatabaseAdminRequiredTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    @patch("api.services.admin_service.is_database_admin", return_value=True)
    @patch("api.services.admin_service.verified_actor", return_value=ADMIN)
    def test_allows_database_admin(self, _actor, _is_admin):
        wrapped = database_admin_required(lambda request: JsonResponse({"ok": True}))
        response = wrapped(self.factory.get("/api/settings/getList/"))
        self.assertEqual(response.status_code, 200)

    @patch("api.services.admin_service.is_database_admin", return_value=False)
    @patch("api.services.admin_service.verified_actor", return_value=ADMIN)
    def test_rejects_non_admin(self, _actor, _is_admin):
        wrapped = database_admin_required(lambda request: JsonResponse({"ok": True}))
        response = wrapped(self.factory.get("/api/settings/getList/"))
        self.assertEqual(response.status_code, 403)


class EmployeePermissionViewTests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    @patch("api.views.workflow_views.TenderService.get_permission")
    @patch("api.views.workflow_views.verified_actor")
    def test_employee_can_read_own_permissions(self, actor, permission):
        actor.return_value = {
            "user_id": 1,
            "username": "employee",
            "role": "employee",
            "employee_id": 11,
            "vendor_id": None,
        }
        permission.return_value = {
            "RetType": 0,
            "RetData": {"empid": 11, "isTenderManage": 1},
        }

        response = workflow_views.my_permissions(
            self.factory.get("/api/settings/myPermission/")
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["RetData"]["isTenderManage"], 1)
        permission.assert_called_once_with(11)

    @patch("api.views.workflow_views.verified_actor", return_value=ADMIN)
    def test_admin_session_cannot_impersonate_employee_permission(self, _actor):
        response = workflow_views.my_permissions(
            self.factory.get("/api/settings/myPermission/")
        )
        self.assertEqual(response.status_code, 403)
