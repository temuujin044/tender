"""Audit business requests and their SQL row changes in the same transaction."""

import json
import logging
from functools import wraps
from uuid import uuid4

import jwt
from django.conf import settings
from django.db import connection, transaction
from django.http import JsonResponse

from api.models import AuditEvent, Tbladmin, Tbltenderuser
from api.services.audit_summary import create_summary

logger = logging.getLogger(__name__)


def verified_actor(request):
    """Never trust createdby/currentuser, user IDs or roles in the request body."""
    authorization = request.headers.get("Authorization", "").split()
    if len(authorization) != 2 or authorization[0].lower() != "bearer":
        raise ValueError("Authentication required")
    try:
        claims = jwt.decode(
            authorization[1], settings.SECRET_KEY, algorithms=["HS256"],
            options={"require": ["exp", "userid", "username", "role"]},
        )
        user_id = int(claims["userid"])
        role = claims["role"]
        if role not in {"admin", "employee", "vendor"} or user_id <= 0:
            raise ValueError("Invalid actor")
        user = Tbltenderuser.objects.filter(userid=user_id).values(
            "username", "empname", "empid", "vendorid"
        ).first()
        if not user or user["username"] != claims["username"]:
            raise ValueError("Unknown actor")
        employee_id = int(claims.get("empid") or 0) or None
        vendor_id = int(claims.get("vendorid") or 0)
        vendor_id = vendor_id if vendor_id > 0 else None
        if role == "employee" and (not employee_id or employee_id != user["empid"]):
            raise ValueError("Invalid employee")
        if role == "vendor" and (not vendor_id or vendor_id != user["vendorid"]):
            raise ValueError("Invalid vendor")
        if role == "admin" and not Tbladmin.objects.filter(
            empid__isnull=True,
            email__iexact=user["username"],
        ).exists():
            raise ValueError("Invalid admin")
    except (jwt.InvalidTokenError, TypeError, KeyError, OverflowError) as exc:
        raise ValueError("Invalid or expired authentication") from exc
    return {
        "user_id": user_id,
        "username": (user["empname"] or user["username"] or str(user_id))[:200],
        "role": role,
        "employee_id": employee_id,
        "vendor_id": vendor_id,
    }


def response_failed(response):
    if response.status_code >= 400:
        return True
    body = getattr(response, "data", None)
    if body is None and not response.streaming and "application/json" in response.get("Content-Type", ""):
        try:
            body = json.loads(response.content)
        except (ValueError, UnicodeDecodeError):
            return True
    if isinstance(body, dict):
        for key in ("RetType", "retType", "ret_type"):
            if key in body and body[key] not in (0, "0", None):
                return True
        if body.get("error") or body.get("success") in (False, 0, "0"):
            return True
    return False


def audited_business_view(view, route):
    """Wrap legacy DRF views without changing their response envelopes."""
    action_name = getattr(getattr(view, "cls", None), "__name__", view.__name__)
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        # POST is also used for filters. Authentication flows and ERP sync are
        # excluded at URL registration; ordinary reads generate no audit rows.
        is_read = action_name.startswith(("get_", "check_"))
        if request.method in {"GET", "HEAD", "OPTIONS"} or is_read:
            return view(request, *args, **kwargs)
        # The existing public registration form shares vendor/save with profile
        # edits. Mirror only its create branch; edits still require a valid token.
        if route == "vendor/save/" and request.method == "POST" and request.content_type == "application/json":
            try:
                registration = json.loads(request.body)
            except (ValueError, UnicodeDecodeError):
                registration = None
            if isinstance(registration, dict) and registration.get("vendorid", 0) == 0:
                return view(request, *args, **kwargs)
        try:
            actor = verified_actor(request)
        except ValueError:
            return JsonResponse({"error": "Нэвтрэх эрх дууссан эсвэл хүчингүй байна. Дахин нэвтэрнэ үү."}, status=401)
        request.audit_actor = actor
        event_data = {
            **actor, "request_id": uuid4(), "action": action_name, "resource": route,
        }
        try:
            with transaction.atomic():
                event = AuditEvent.objects.create(**event_data, outcome="pending", status_code=200)
                with connection.cursor() as cursor:
                    cursor.execute("SELECT set_config('tender.audit_event_id', %s, true)", [str(event.pk)])
                from api.services.workflow_service import guard_mutation
                from rest_framework.exceptions import APIException
                try:
                    guard_mutation(request, route, kwargs)
                    response = view(request, *args, **kwargs)
                except APIException as exc:
                    response = JsonResponse({'error': str(exc.detail)}, status=exc.status_code)
                failed = response_failed(response)
                if failed or connection.needs_rollback:
                    failed = True
                    transaction.set_rollback(True)
                else:
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT set_config('tender.audit_event_id', '', true)")
                    AuditEvent.objects.filter(pk=event.pk).update(
                        outcome="success", status_code=response.status_code
                    )
                    event.outcome = "success"
                    create_summary(event)
            if failed:
                # Keep failed attempts, but never commit their partial SQL writes.
                failed_event = AuditEvent.objects.create(**event_data, outcome="failed", status_code=response.status_code)
                create_summary(failed_event)
            return response
        except Exception:
            # No request body, token, network information or exception text in the log.
            # If storage itself is unavailable the mutation has already rolled back.
            try:
                failed_event = AuditEvent.objects.create(**event_data, outcome="failed", status_code=500)
                create_summary(failed_event)
            except Exception:
                logger.error("Business audit storage unavailable (request %s)", event_data["request_id"])
            raise
    return wrapped


def can_view_audit(actor):
    return (
        actor["role"] in {"admin", "employee"}
        and actor["user_id"] in settings.AUDIT_LOG_VIEWER_USER_IDS
    )


def audit_viewer_required(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        try:
            actor = verified_actor(request)
        except ValueError:
            return JsonResponse({"error": "Нэвтэрнэ үү."}, status=401)
        if not can_view_audit(actor):
            return JsonResponse({"error": "Үйлдлийн түүх харах эрхгүй байна."}, status=403)
        return view(request, *args, **kwargs)
    return wrapped
