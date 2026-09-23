from django.http import JsonResponse
from django.views.decorators.http import require_GET

from api.services.admin_service import admin_capabilities
from api.services.audit_service import verified_actor


@require_GET
def access(request):
    try:
        actor = verified_actor(request)
    except ValueError:
        return JsonResponse({"error": "Нэвтэрч орно уу."}, status=401)
    response = JsonResponse(admin_capabilities(actor))
    response["Cache-Control"] = "private, no-store"
    return response
