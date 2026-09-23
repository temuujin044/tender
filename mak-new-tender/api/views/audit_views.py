from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db.models import Count, Q
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from api.models import AuditEvent
from api.services.audit_service import audit_viewer_required, can_view_audit, verified_actor


@require_GET
def access(request):
    try:
        actor = verified_actor(request)
    except ValueError:
        return JsonResponse({"error": "Нэвтэрнэ үү."}, status=401)
    response = JsonResponse({"can_view_audit": can_view_audit(actor)})
    response["Cache-Control"] = "private, no-store"
    return response


def page_options(request):
    page = int(request.GET.get("page", 1))
    size = int(request.GET.get("page_size", 50))
    if page < 1 or not 1 <= size <= 100:
        raise ValueError("Invalid pagination")
    return page, size


@require_GET
@audit_viewer_required
def events(request):
    try:
        page, size = page_options(request)
        rows = AuditEvent.objects.all()
        business = request.GET.get('presentation') == 'business'
        if business:
            rows = rows.filter(summary__visible=True)
            if request.GET.get('entity'):
                term = request.GET['entity'][:250]
                rows = rows.filter(Q(summary__entity_name__icontains=term) | Q(summary__entity_code__icontains=term))
        for key in ("user_id", "vendor_id", "employee_id"):
            if request.GET.get(key):
                rows = rows.filter(**{key: int(request.GET[key])})
        for key in ("role", "action", "outcome"):
            if request.GET.get(key):
                rows = rows.filter(**{key: request.GET[key]})
        if request.GET.get("username"):
            rows = rows.filter(username__icontains=request.GET["username"][:200])
        for param, lookup in (("date_from", "occurred_at__gte"), ("date_to", "occurred_at__lt")):
            if request.GET.get(param):
                day = datetime.strptime(request.GET[param], "%Y-%m-%d").date()
                if param == "date_to":
                    day += timedelta(days=1)
                rows = rows.filter(**{lookup: datetime.combine(day, time.min, ZoneInfo("Asia/Ulaanbaatar"))})
        if request.GET.get("invitation_id"):
            rows = rows.filter(changes__record_key__invitationid=int(request.GET["invitation_id"])).distinct()
        if request.GET.get("tender_id"):
            rows = rows.filter(changes__record_key__tenderid=int(request.GET["tender_id"])).distinct()
        count = rows.count()
        data = list(rows.annotate(change_count=Count("changes", distinct=True)).values()[
            (page - 1) * size:page * size
        ])
        if business:
            from api.models import AuditSummary
            summaries = {s.event_id: s for s in AuditSummary.objects.filter(event_id__in=[r['id'] for r in data])}
            for row in data:
                summary = summaries[row['id']]
                row.update(title=summary.title, entity_name=summary.entity_name, entity_code=summary.entity_code, change_count=len(summary.details))
    except (ValueError, OverflowError):
        return JsonResponse({"error": "Шүүлтүүр эсвэл хуудасны утга буруу байна."}, status=400)
    return JsonResponse({"count": count, "page": page, "page_size": size, "results": data})


@require_GET
@audit_viewer_required
def event_detail(request, event_id):
    try:
        page, size = page_options(request)
    except (ValueError, OverflowError):
        return JsonResponse({"error": "Invalid pagination"}, status=400)
    event = AuditEvent.objects.filter(pk=event_id).values().first()
    if not event:
        return JsonResponse({"error": "Бүртгэл олдсонгүй."}, status=404)
    if request.GET.get('presentation') == 'business':
        from api.models import AuditSummary
        summary = AuditSummary.objects.filter(event_id=event_id, visible=True).first()
        if not summary:
            return JsonResponse({'error': 'Бүртгэл олдсонгүй.'}, status=404)
        event.update(title=summary.title, entity_name=summary.entity_name, entity_code=summary.entity_code)
        return JsonResponse({'event': event, 'count': len(summary.details), 'page': page, 'page_size': size,
                             'details': summary.details[(page - 1) * size:page * size], 'changes': []})
    changes = AuditEvent.objects.get(pk=event_id).changes.order_by("id")
    return JsonResponse({
        "event": event, "count": changes.count(), "page": page, "page_size": size,
        "changes": list(changes.values()[(page - 1) * size:page * size]),
    })
