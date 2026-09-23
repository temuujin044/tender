"""Authorization helpers for the administration portal."""

from functools import wraps

from django.http import JsonResponse

from api.services.audit_service import can_view_audit, verified_actor


def is_database_admin(actor):
    # verified_actor has already confirmed that this signed admin session still
    # belongs to an enabled, dedicated TBLADMIN account.
    return actor.get("role") == "admin"


def admin_capabilities(actor):
    can_manage_settings = is_database_admin(actor)
    can_view_history = can_manage_settings and can_view_audit(actor)
    return {
        "can_access_admin": can_manage_settings or can_view_history,
        "can_manage_settings": can_manage_settings,
        "can_view_audit": can_view_history,
    }


def database_admin_required(view):
    """Require an authenticated dedicated administrator account."""

    @wraps(view)
    def wrapped(request, *args, **kwargs):
        try:
            actor = verified_actor(request)
        except ValueError:
            return JsonResponse({"error": "Нэвтэрч орно уу."}, status=401)
        if not is_database_admin(actor):
            return JsonResponse({"error": "Админ тохиргоо удирдах эрхгүй байна."}, status=403)
        request.admin_actor = actor
        return view(request, *args, **kwargs)

    return wrapped
