from rest_framework.decorators import api_view , parser_classes
from rest_framework.response import Response
from rest_framework import status
from api.serializers.tender_serializer import (
    TenderFilterSerializer,  TBLINVITATIONOFTENDERSerializer,
    EvalutaioinMemberSerializer, FinalEvaluationSerializer, InvitationVendorSelectionSerializer, OpenTenderSerializer , FinishInvitationSerializer,RejectInvSerializer , PublishRequestSerializer , RePublishRequestSerializer,RePublishInvitationSerializer
)

from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.db.models import Count , F, Value, Case, When, IntegerField
from django.utils import timezone
from datetime import datetime
from decimal import Decimal, InvalidOperation
import calendar
import mimetypes
from pathlib import Path
from uuid import uuid4
from django.conf import settings
from django.db import connection, transaction
from django.http import FileResponse, JsonResponse
from rest_framework.parsers import FormParser, MultiPartParser
from api.services.user_service import get_users_invitation_ids , obtain_erp_session
from api.services.tender_service import TenderService
from api.services.email_service import EmailService
from api.services.workflow_service import (
    REQUIRED_VENDOR_DOCUMENT_TYPE_IDS,
    require_bid_document_access,
    require_evaluation_access,
)
from api.services.audit_service import verified_actor
from rest_framework.exceptions import APIException, AuthenticationFailed, PermissionDenied

email_service = EmailService() 

from api.models import (
    Tbltender,
    Tblinvitation,
    Tbljoinwork,
    Tblinvitationofvendor,
)


EMAIL_CONFIG = {
    "From": "no-reply@mak.mn"
}

PORTAL_CRITERIA_TYPE_IDS = {'financial': 1, 'experience': 24, 'technical': 27}
PORTAL_REQUIREMENT_TYPE_IDS = {'financial': 14, 'technical': 35, 'general': 54}
PORTAL_ROLE_IDS = {'chair': 1, 'secretary': 2, 'member': 3, 'internal-control': 4}


def _has_portal_draft_content(header, details):
    text_values = [
        header.get('tendername'), header.get('startdate'), header.get('enddate'),
        header.get('evaluationdate'), details.get('acceptdate'),
        details.get('opendate'), details.get('description'), details.get('note'),
    ]
    if any(str(value).strip() for value in text_values if value is not None):
        return True

    numeric_values = [
        header.get('tendertypeid'), header.get('purchasetypeid'),
        header.get('departmentid'), header.get('activityid'), header.get('budget'),
    ]
    for value in numeric_values:
        try:
            if Decimal(str(value or 0)) != 0:
                return True
        except (InvalidOperation, TypeError, ValueError):
            continue

    return any(bool(value) for value in [
        header.get('activityids'), header.get('batch'), details.get('criteria'),
        details.get('requirements'), details.get('members'),
    ])


def _sync_portal_committee(cursor, invitation_id, members, created_by):
    cursor.execute("DELETE FROM TBLEVALUATION WHERE invitationid=%s", [invitation_id])
    for member in members:
        role_id = PORTAL_ROLE_IDS.get(member.get('role'))
        if role_id is None:
            raise ValueError("Үнэлгээний хорооны гишүүний үүрэг буруу байна.")
        emp_id = int(member.get('empid') or 0)
        employee = None
        if emp_id > 0:
            cursor.execute(
                "SELECT empid, empname, positionname, email FROM TBLEMP WHERE empid=%s LIMIT 1",
                [emp_id],
            )
            employee = cursor.fetchone()
        elif member.get('email'):
            cursor.execute(
                "SELECT empid, empname, positionname, email FROM TBLEMP WHERE email=%s ORDER BY empid LIMIT 1",
                [member['email']],
            )
            employee = cursor.fetchone()
        if not employee:
            raise ValueError("Үнэлгээний хорооны ажилтан TBLEMP хүснэгтээс олдсонгүй.")
        cursor.execute("""
            INSERT INTO TBLEVALUATION
                (invitationid, empid, empname, positionname, roleid, createdby, created, email)
            VALUES (%s, %s, %s, %s, %s, %s, NOW(), %s)
        """, [
            invitation_id,
            int(employee[0]),
            employee[1] or '',
            employee[2] or '',
            role_id,
            created_by,
            employee[3] or '',
        ])


def _replace_portal_tender_details(cursor, data, sync_members=True):
    invitation_id = data['invitationid']
    created_by = data.get('createdby', '')

    _sync_portal_requirements(cursor, invitation_id, data.get('requirements', []))
    cursor.execute("DELETE FROM TBLCRITERIA WHERE invitationid=%s", [invitation_id])
    for item in data.get('criteria', []):
        cursor.execute("""
            INSERT INTO TBLCRITERIA (invitationid, joinworkid, criteriatypeid, criterianame, weight, visible)
            VALUES (%s, 0, %s, %s, %s, 1)
        """, [
            invitation_id,
            PORTAL_CRITERIA_TYPE_IDS.get(item.get('type'), 27),
            item.get('name', ''),
            item.get('weight', 0),
        ])

    if sync_members:
        _sync_portal_committee(cursor, invitation_id, data.get('members', []), created_by)

def _sync_portal_requirements(cursor, invitation_id, items):
    cursor.execute("SELECT requireid, requirename, requiretypeid, document_required FROM TBLREQUIRE WHERE invitationid=%s FOR UPDATE", [invitation_id])
    existing = {row[0]: row[1:] for row in cursor.fetchall()}
    kept = set()
    for item in items:
        name = item.get('name', '')
        kind = PORTAL_REQUIREMENT_TYPE_IDS.get(item.get('type'), 54)
        required = item.get('documentRequired')
        if required is not None and not isinstance(required, bool):
            raise ValueError('Баримт хавсаргах утга буруу байна.')
        raw_id = str(item.get('id', ''))
        key = int(raw_id) if raw_id.isdigit() and int(raw_id) > 0 else None
        if key is not None and (key not in existing or key in kept):
            raise ValueError('Шаардлага энэ урилгад хамаарахгүй эсвэл давхардсан байна.')
        if key is None:
            # Old clients may omit IDs. Reuse exact matches, never infer edits.
            key = next((pk for pk, row in existing.items() if pk not in kept and row[0] == name and row[1] == kind and (required is None or row[2] == required)), None)
        if key is not None:
            if required is None:
                required = existing[key][2]
            cursor.execute("UPDATE TBLREQUIRE SET requirename=%s, requiretypeid=%s, document_required=%s, visible=1 WHERE requireid=%s AND invitationid=%s", [name, kind, required, key, invitation_id])
        else:
            cursor.execute("INSERT INTO TBLREQUIRE (invitationid, requirename, requiretypeid, document_required, visible) VALUES (%s,%s,%s,%s,1) RETURNING requireid", [invitation_id, name, kind, required])
            key = cursor.fetchone()[0]
        kept.add(key)
        item['id'] = str(key)
    removed = list(set(existing) - kept)
    if removed:
        cursor.execute("DELETE FROM TBLREQUIRE WHERE invitationid=%s AND requireid = ANY(%s)", [invitation_id, removed])


def get_date_range(param):
    start_date = end_date = None

    # Year
    if param.get("year"):
        start_date = datetime(int(param["year"]), 1, 1)
        end_date = datetime(int(param["year"]), 12, 31)

    # Quarter
    elif param.get("quarter"):
        year = int(param["quarter"][:4])
        quarter = param["quarter"][-2:]
        if quarter == "Q1":
            start_date, end_date = datetime(year, 1, 1), datetime(year, 3, 31)
        elif quarter == "Q2":
            start_date, end_date = datetime(year, 4, 1), datetime(year, 6, 30)
        elif quarter == "Q3":
            start_date, end_date = datetime(year, 7, 1), datetime(year, 9, 30)
        elif quarter == "Q4":
            start_date, end_date = datetime(year, 10, 1), datetime(year, 12, 31)

    # Month
    elif param.get("month"):
        dt = datetime.strptime(param["month"], "%Y-%m")
        last_day = calendar.monthrange(dt.year, dt.month)[1]
        start_date = datetime(dt.year, dt.month, 1)
        end_date = datetime(dt.year, dt.month, last_day)

    # Day
    elif param.get("day"):
        dt = datetime.strptime(param["day"], "%Y-%m-%d")
        start_date = end_date = dt

    # Fallback: return None if nothing provided
    return start_date, end_date


@api_view(['POST'])
def get_tender_counts(request):
    param = request.data

    start_date, end_date = get_date_range(param)
    if not start_date or not end_date:
        return Response({"error": "Invalid date parameters"}, status=400)

    start_date = timezone.make_aware(start_date)
    end_date = timezone.make_aware(end_date)

    counts = {
        "tenders": Tbltender.objects.filter(
            publishdate__range=[start_date, end_date]
        ).count(),

        "invitations": Tblinvitation.objects.filter(
            tender__publishdate__range=[start_date, end_date],
            status__in=[0, 6]
        ).count(),

        "open_invitations": Tblinvitation.objects.filter(
            opendate__range=[start_date, end_date],
            status__in=[1, 3]
        ).count(),

        "result_invitations": Tblinvitation.objects.filter(
            opendate__range=[start_date, end_date],
            status__in=[7, 8, 9, 10]
        ).count(),

        "joinworks": Tbljoinwork.objects.filter(
            enddate__range=[start_date, end_date]
        ).count()
    }

    tender_type_distribution = (
        Tblinvitation.objects.filter(
            opendate__range=[start_date, end_date],
            status__in=[1, 3]
        )
        .values('tender__tendertype__tendertypename')
        .annotate(count=Count('tender__tendertype__tendertypename'))
    )

    vendor_distribution = (
        Tblinvitationofvendor.objects.filter(
            invitation__opendate__range=[start_date, end_date],
            status=5
        )
        .values('vendor__vendorname')
        .annotate(count=Count('vendor__vendorname'))
    )

    return Response({
        "counts": counts,
        "tender_type_distribution": list(tender_type_distribution),
        "vendor_distribution": list(vendor_distribution)
    })

@api_view(['POST'])
def get_tender_counts_for_emp(request):
    param = request.data
    start_date, end_date = get_date_range(param)

    user_id = param.get("user")
    invitation_ids = get_users_invitation_ids(user_id)

    inv_filter = {}
    if invitation_ids is not None:
        inv_filter["invitationid__in"] = invitation_ids


    tendercount = Tbltender.objects.filter(
        publishdate__range=[start_date, end_date]
    ).count()

    invcount = Tblinvitation.objects.filter(
        status__in=[0, 6],
        **inv_filter
    ).count()

    invopencount = Tblinvitation.objects.filter(
        opendate__range=[start_date, end_date],
        status__in=[1, 3],
        **inv_filter
    ).count()

    resultcount = Tblinvitation.objects.filter(
        opendate__range=[start_date, end_date],
        status__in=[7, 8, 9, 10],
        **inv_filter
    ).count()

    joinworkcount = Tbljoinwork.objects.filter(
        enddate__range=[start_date, end_date]
    ).count()

    counts = {
        "tendercount": tendercount,
        "invcount": invcount,
        "invopencount": invopencount,
        "resultcount": resultcount,
        "joinworkcount": joinworkcount,
    }

    tender_type_distribution = (
        Tblinvitation.objects.filter(
            opendate__range=[start_date, end_date],
            status__in=[1, 3]
        )
        .values("tender_id")
        .annotate(value=Count("tender_id"))
    )

  
    vendor_distribution = (
        Tblinvitationofvendor.objects.filter(
            status=5
        )
        .values("vendor_id")
        .annotate(value=Count("vendor_id"))
    )

    return Response({
        "counts": counts,
        "tender_type_distribution": list(tender_type_distribution),
        "vendor_distribution": list(vendor_distribution),
    })

@api_view(["GET"]) 
def get_tender_list(request):
    user = request.query_params.get("user")

    invitation_ids = get_users_invitation_ids(user)

    invitation_filter = {}
    if invitation_ids is not None:
        invitation_filter["invitationid__in"] = invitation_ids

    qs = (
        Tblinvitation.objects
        .exclude(status=10)
        .filter(**invitation_filter)
        .select_related(
            "tender",
            "tender__tendertype",
            "tender__purchasetype",
            "tender__department",
        )
        .order_by("-acceptdate")
    )

    data = qs.values(
        "tender_id",
        "acceptdate",
        "opendate",
        "status",
        tendercode=F("tender__tendercode"),
        tendername=F("tender__tendername"),
        departmentid=F("tender__departmentid"),
        tendertypeid=F("tender__tendertype_id"),
        purchasetypeid=F("tender__purchasetypeid"),
        startdate=F("tender__startdate"),
        enddate=F("tender__enddate"),
        plandate=F("tender__plandate"),
        evaluationdate=F("tender__evaluationdate"),
        publishdate=F("tender__publishdate"),
        budget=F("tender__budget"),
        isedit=Case(
            When(status__in=[0, 6], then=Value(1)),
            default=Value(0),
            output_field=IntegerField(),   
        ),
    )

    return Response(list(data))

@api_view(['GET'])
def get_tender_plan_list(request):
    result = TenderService.get_tender_plan_list()
    return Response(result)

@api_view(['POST'])
def get_tender_list_by_filter(request):

    service = TenderService()

    tenders = service.get_tender_list_by_filter(request.data)

    serializer = TenderFilterSerializer(tenders, many=True)

    return Response({
        "retType": 0,
        "data": serializer.data
    })

@api_view(['POST'])
def get_tender_plan_list_by_filter(request):
    service = TenderService()

    tenders = service.get_tender_plan_list_by_filter(request.data)

    serializer = TenderFilterSerializer(tenders, many=True)

    return Response({
        "retType": 0,
        "data": serializer.data
    })

@api_view(['DELETE'])
def delete_tender(request, tenderid):

    service = TenderService()

    result = service.delete_tender(tenderid)

    return Response(result)

@api_view(['POST'])
def save_tender(request):

    service = TenderService()

    result = service.save_tender(request.data)

    return Response(result)

@api_view(['GET'])
def get_tender_initial_data(request, tenderid):
    service = TenderService()
    result = service.get_tender_initial_data(tenderid)
    return Response(result)


@api_view(["POST"])
def update_tender_vendor_evaluation_status(request):
    service = TenderService()
    result = service.update_tender_vendor_evaluation_status(request.data)
    return Response(result)

@api_view(["POST"])
def get_tender_vendor_evaluation_status(request):
    service = TenderService()
    result = service.get_tender_vendor_evaluation_status(request.data)
    return Response(result)

# # -------------------
# # Invitation endpoints
# # -------------------

@api_view(["POST"])
def save_invitation_header(request):
    tenderid = request.data.get("tenderid")
    createdby = request.data.get("createdby")
    invitationid = request.data.get("invitationid", 0)

    result = TenderService.save_invitation_header(tenderid, createdby, invitationid)
    return Response(result)

@api_view(["POST"])
def save_invitation(request):
    result = TenderService.save_invitation(request.data)
    return Response(result)

@api_view(["POST"])
def send_new_tender_notification(request):
    result = TenderService.send_new_tender_notification(request.data)
    return Response(result)

@api_view(["POST"])
def send_new_joinwork_notification(request):
    result = TenderService.send_new_joinwork_notification(request.data)
    return Response(result)

@api_view(["POST"])
def delay_invitation(request):
    result = TenderService.delay_invitation(request.data)
    return Response(result)

@api_view(['POST'])
def insert_invitation_of_tender(request):
    serializer = TBLINVITATIONOFTENDERSerializer(data=request.data)
    if serializer.is_valid():
        validated = serializer.validated_data
        result = TenderService.insert_invitation_of_tender({
            "invitationid": validated["invitation_id"],
            "tenderid": validated["tender_id"],
            "vendorid": validated["vendor_id"],
            "createdby": request.data.get("createdby", ""),
        })
        return Response(result or {}, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
def evaluete_invitation_of_vendor(request):
    serializer = EvalutaioinMemberSerializer(data=request.data)
    if serializer.is_valid():
        result = TenderService.evaluate_invitation_of_vendor(serializer.validated_data)
        return Response(result or {}, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
def final_evaluation_invitation_of_vendor(request):
    serializer = FinalEvaluationSerializer(data=request.data)
    if serializer.is_valid():
        result = TenderService.final_evaluation_invitation_of_vendor(serializer.validated_data)
        return Response(result or {}, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
def evaluate_invitation_first_round_view(request):
    serializer = InvitationVendorSelectionSerializer(data=request.data)
    if serializer.is_valid():
        result = TenderService.evaluate_invitation_first_round(serializer.validated_data)
        return Response(result or {}, status=status.HTTP_200_OK)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
def open_invitation_of_vendor(request):
    serializer = OpenTenderSerializer(data=request.data)
    if serializer.is_valid():
        result = TenderService.open_invitation_of_vendor(serializer.validated_data)
        return Response(result or {}, status=status.HTTP_200_OK)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(["POST"])
def finish_invitation(request):
    serializer = FinishInvitationSerializer(data=request.data)
    if serializer.is_valid():
        result = TenderService.finish_invitation(
            serializer.validated_data["invitationid"]
        )
        return Response(result, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
def reject_invitation(request):
    serializer = RejectInvSerializer(data=request.data)
    if serializer.is_valid():
        result = TenderService.reject_invitation(serializer.validated_data)
        return Response(result or {}, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
def publish_request_inv(request):
    serializer = PublishRequestSerializer(data=request.data)
    if serializer.is_valid():
        result = TenderService.publish_request_inv(serializer.validated_data)
        return Response(result or {}, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(["POST"])
def re_publish_request_inv(request):
    serializer = RePublishRequestSerializer(data=request.data)
    if serializer.is_valid():
        result = TenderService.re_publish_request_inv(serializer.validated_data)
        return Response(result, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(["POST"])
def re_publish_invitation(request):
    serializer = RePublishInvitationSerializer(data=request.data)
    if serializer.is_valid():
        result = TenderService.re_publish_invitation(serializer.validated_data)
        return Response(result)
    return Response(serializer.errors, status=400)


@api_view(['POST'])
def update_invitation_of_tender(request):
    invitationid = request.data.get("invitationid")
    vendorid = request.data.get("vendorid")
    result = TenderService.update_invitation_of_tender(invitationid, vendorid)
    return Response(result or {}, status=status.HTTP_200_OK)

@api_view(["GET"])
def get_invitation_of_vendor_list_view(request):
    invitationid = request.GET.get("invitationid")
    try:
        actor = verified_actor(request)
    except ValueError:
        raise AuthenticationFailed('Дахин нэвтэрнэ үү.')
    require_evaluation_access(actor, invitationid)
    empid = actor['employee_id']
    result = TenderService.get_invitation_of_vendor_list(invitationid, empid)
    return Response(result)

@api_view(["GET"])
def get_invitations_vendor_list_all_view(request):
    invitationid = request.GET.get("invitationid")
    result = TenderService.get_invitations_vendor_list_all(invitationid)
    return Response(result)

@api_view(["GET"])
def get_invitations_vendor_list_for_next_round_view(request):
    invitationid = request.GET.get("invitationid")
    stage = request.GET.get("stage")
    result = TenderService.get_invitations_vendor_list_for_next_round(invitationid, stage)
    return Response(result)

@api_view(["GET"])
def get_invitation_of_vendor_round_evaluation_view(request):

    invitationid = request.GET.get("invitationid")
    vendorid = request.GET.get("vendorid")
    empid = request.GET.get("empid")

    result = TenderService.get_invitation_of_vendor_round_evaluation(
        invitationid,
        vendorid,
        empid
    )

    return Response(result)

@api_view(["GET"])
def get_invitations_vendor_evaluation_list_view(request):
    invitationid = request.GET.get("invitationid")
    result = TenderService.get_invitations_vendor_evaluation_list(invitationid)
    return Response(result)

@api_view(["GET"])
def get_invitations_vendor_first_evaluation_list_view(request):
    invitationid = request.GET.get("invitationid")
    result = TenderService.get_invitations_vendor_first_evaluation_list(invitationid)
    return Response(result)

@api_view(["GET"])
def get_invitation_of_vendor_list_by_id_view(request):

    invitationid = request.GET.get("invitationid")
    vendorid = request.GET.get("vendorid")
    try:
        actor = verified_actor(request)
    except ValueError:
        raise AuthenticationFailed('Дахин нэвтэрнэ үү.')
    require_evaluation_access(actor, invitationid)
    empid = actor['employee_id']

    result = TenderService.get_invitation_of_vendor_list_by_id(
        invitationid,
        vendorid,
        empid
    )

    return Response(result)

@api_view(["GET"])
def get_invitation_of_vendors_final_result_view(request):
    invitationid = request.GET.get("invitationid")
    vendorid = request.GET.get("vendorid")
    result = TenderService.get_invitation_of_vendors_final_result(invitationid, vendorid)

    return Response(result)

@api_view(["POST"])
def save_invitation_vendor_round_selection_result_view(request):
    param_list = request.data
    result = TenderService.save_invitation_vendor_round_selection_result(param_list)
    return Response(result)

@api_view(["DELETE"])
def delete_invitation_of_vendor_view(request):
    vendor_id = request.GET.get("id")
    result = TenderService.delete_invitation_of_vendor(vendor_id)
    return Response(result)

@api_view(["GET"])
def get_invitation_list_view(request):
    user = request.GET.get("user")
    result = TenderService.get_invitation_list(user)
    return Response(result)

@api_view(["GET"])
def get_invitation_list_open_view(request):
    user = request.GET.get("user")
    result = TenderService.get_invitation_list_open(user)
    return Response(result)

@api_view(["GET"])
def get_invitation_list_result_view(request):
    user = request.GET.get("user")
    result = TenderService.get_invitation_list_result(user)
    return Response(result)

@api_view(["GET"])
def get_invitation_list_for_vendor_view(request):
    actor = None
    if request.headers.get("Authorization"):
        try:
            actor = verified_actor(request)
        except ValueError:
            return Response(
                {"retType": 1, "retMsg": "Нэвтрэх эрх хүчингүй байна.", "retData": []},
                status=401,
            )

    is_vendor = bool(actor and actor.get("role") == "vendor")
    matching_only = is_vendor and request.GET.get("scope", "matching") != "all"
    result = TenderService.get_invitation_list_for_vendor(
        vendorid=actor.get("vendor_id") if is_vendor else None,
        matching_only=matching_only,
    )
    return Response(result)

@api_view(["GET"])
def check_invitation_for_vendor_view(request):
    invitationid = request.GET.get("invitationid")
    vendorid = request.GET.get("vendorid")

    try:
        invitationid = int(invitationid)
        vendorid = int(vendorid)
    except (TypeError, ValueError):
        return Response({"retType": 1, "retMsg": "Invalid invitationid or vendorid", "retData": []})

    result = TenderService.check_invitation_for_vendor(vendorid, invitationid)
    return Response(result)

@api_view(["GET"])
def get_invitation_list_participated_view(request):
    vendorid = request.GET.get("vendorid")

    try:
        vendorid = int(vendorid)
    except (TypeError, ValueError):
        return Response({"retType": 1, "retMsg": "Invalid vendorid", "retData": []})

    result = TenderService.get_invitation_list_participated(vendorid)
    return Response(result)

@api_view(["GET"])
def get_invitation_list_involved_view(request):
    vendorid = request.GET.get("vendorid")

    try:
        vendorid = int(vendorid)
    except (TypeError, ValueError):
        return Response({"retType": 1, "retMsg": "Invalid vendorid", "retData": []})

    result = TenderService.get_invitation_list_involved(vendorid)
    return Response(result)

@api_view(["POST"])
def get_invitation_list_by_filter_view(request):
    filter_data = request.data or {}
    result = TenderService.get_invitation_list_by_filter(filter_data)
    return Response(result)

@api_view(["GET"])
def get_invitation_count_by_vendor_view(request, vendorid):
    result = TenderService.get_invitation_count_by_vendor(vendorid)
    return Response(result)

@api_view(['GET'])
def invitation_to_pdf_view(request):
    try:
        tenderid = int(request.GET.get('tenderid', 0))
        invitationid = int(request.GET.get('invitationid', 0))
        result = TenderService.get_invitation_to_pdf(tenderid, invitationid)
        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)
        return Response({"data": result['retData']}, status=200)

    except Exception as ex:
        return Response({"error": str(ex)}, status=500)
    
@api_view(['GET'])
def invitation_detail_view(request):
    try:
        invitationid = int(request.GET.get('invitationid', 0))
        if invitationid == 0:
            return Response({"error": "invitationid is required"}, status=400)

        result = TenderService.get_invitation_dtl(invitationid)

        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)

        return Response({"data": result['retData']}, status=200)

    except Exception as ex:
        return Response({"error": str(ex)}, status=500)
    
@api_view(['GET'])
def joinwork_detail_view(request, joinworkid):
    result = TenderService.get_joinwork_dtl(joinworkid)
    return JsonResponse(result)

@api_view(['GET'])
def comments_by_vendor_view(request, invitationid, vendorid):
    result = TenderService.get_comments_by_vendor(invitationid, vendorid)
    return JsonResponse(result)


@api_view(['GET'])
def tender_doc_list_view(request):
    try:
        invitationid = int(request.GET.get('invitationid', 0))
        joinworkid = int(request.GET.get('joinworkid', 0))

        if invitationid == 0 and joinworkid == 0:
            return Response({"error": "invitationid or joinworkid is required"}, status=400)

        result = TenderService.get_tender_doc_list(invitationid=invitationid, joinworkid=joinworkid)

        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)

        return Response({"data": result['retData']}, status=200)

    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

@api_view(['GET'])
def tender_doc_join_list_view(request):
    invitationid = int(request.GET.get('invitationid', 0))
    vendorid = int(request.GET.get('vendorid', 0))

    if invitationid == 0 or vendorid == 0:
        return Response({"error": "invitationid and vendorid are required"}, status=400)

    try:
        actor = verified_actor(request)
    except ValueError:
        raise AuthenticationFailed('Дахин нэвтэрнэ үү.')
    if actor['role'] == 'vendor':
        if actor['vendor_id'] != vendorid:
            raise PermissionDenied('Зөвхөн өөрийн байгууллагын баримт бичгийг харна.')
    else:
        require_bid_document_access(actor, invitationid)
    result = TenderService.get_tender_doc_join_list(invitationid=invitationid, vendorid=vendorid)

    if result['retType'] != 0:
        return Response({"error": result['retMsg']}, status=400)

    return Response({"data": result['retData']}, status=200)
    
@api_view(['GET'])
def tender_doc_join_data_view(request):
    try:
        joindocid = int(request.GET.get('joindocid', 0))
        invitationid = int(request.GET.get('invitationid', 0))
        tenderid = int(request.GET.get('tenderid', 0))

        if joindocid == 0 or invitationid == 0 or tenderid == 0:
            return Response({"error": "joindocid, invitationid, and tenderid are required"}, status=400)

        try:
            actor = verified_actor(request)
        except ValueError:
            raise AuthenticationFailed('Дахин нэвтэрнэ үү.')
        require_bid_document_access(actor, invitationid)
        with connection.cursor() as cursor:
            cursor.execute(
                '''
                SELECT 1
                FROM tbltenderjoindoc
                WHERE joindocid=%s AND invitationid=%s AND tenderid=%s
                ''',
                [joindocid, invitationid, tenderid],
            )
            if not cursor.fetchone():
                return Response({"error": "Document does not belong to this tender"}, status=404)

        result = TenderService.get_tender_doc_join_data(joindocid, invitationid, tenderid)

        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)

        return Response({"data": result['retData']}, status=200)

    except APIException:
        raise
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)
    
@api_view(['GET'])
def folder_case_list_view(request):

    try:
        invitationid = int(request.GET.get('invitationid', 0))

        if invitationid == 0:
            return Response({"error": "invitationid is required"}, status=400)

        result = TenderService.get_folder_case_list(invitationid)

        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)

        return Response({"data": result['retData']}, status=200)

    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

@api_view(['GET'])
def folder_case_by_id_view(request):
    try:
        folder_id = int(request.GET.get('id', 0))

        if folder_id == 0:
            return Response({"error": "id is required"}, status=400)

        result = TenderService.get_folder_case_by_id(folder_id)

        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)

        return Response({"data": result['retData']}, status=200)

    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

@api_view(['GET'])
def join_work_doc_list_view(request):

    try:
        joinworkid = int(request.GET.get('joinworkid', 0))
        vendorid = int(request.GET.get('vendorid', 0))

        if joinworkid == 0 or vendorid == 0:
            return Response({"error": "joinworkid and vendorid are required"}, status=400)

        result = TenderService.get_join_work_doc_list(joinworkid=joinworkid, vendorid=vendorid)

        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)

        return Response({"data": result['retData']}, status=200)

    except Exception as ex:
        return Response({"error": str(ex)}, status=500)
    
@api_view(['POST'])
def save_tender_doc_view(request):
    try:
        data = request.data

        required_fields = ['documentname', 'doctypeid', 'batchid', 'tenderid', 'invitationid', 'createdby']
        missing = [f for f in required_fields if f not in data]
        if missing:
            return Response({"error": f"Missing fields: {', '.join(missing)}"}, status=400)

        result = TenderService.save_tender_doc(data)

        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)

        return Response({"docid": result['retData']}, status=200)

    except Exception as ex:
        return Response({"error": str(ex)}, status=500)   
    
@api_view(['POST'])
def save_join_work_document_view(request):
    try:
        data = request.data
        result = TenderService.save_join_work_document(data)
        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)
        return Response({"data": result['retData']}, status=200)

    except Exception as ex:
        return Response({"error": str(ex)}, status=500)
    
@api_view(['POST'])
def save_tender_join_doc_view(request):
    try:
        data = request.data
        result = TenderService.save_tender_join_doc(data)
        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)
        return Response({"data": result['retData']}, status=200)
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

@api_view(['POST'])
def save_joinwork_doc_view(request):
    try:
        data = request.data
        result = TenderService.save_joinwork_doc(data)
        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)
        return Response({"data": result['retData']}, status=200)
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

@api_view(['POST'])
def save_folder_case_view(request):
    try:
        data = request.data
        result = TenderService.save_folder_case(data)
        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)
        return Response({"data": result['retData']}, status=200)
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

@api_view(['POST'])
def save_tender_doc_file_view(request):
    try:
        files = request.data.get("files", [])
        result = TenderService.save_tender_doc_file(files)
        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)
        return Response({"message": "Files saved successfully"}, status=200)
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)
    
@api_view(['POST'])
def save_vendor_company_doc_view(request):
    try:
        data = request.data
        result = TenderService.save_vendor_company_doc(data)
        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)
        return Response({"data": result['retData']}, status=200)
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

@api_view(['GET'])
def get_file_path_view(request):
    try:
        sourceid = int(request.GET.get('sourceid', 0))
        sourcetype = request.GET.get('sourcetype', '')
        if sourceid == 0 or sourcetype == "":
            return Response({"error": "sourceid and sourcetype are required"}, status=400)
        if sourcetype == 'TenderJoinDoc':
            try:
                actor = verified_actor(request)
            except ValueError:
                raise AuthenticationFailed('Дахин нэвтэрнэ үү.')
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT invitationid,vendorid FROM tbltenderjoindoc WHERE joindocid=%s',
                    [sourceid],
                )
                document_owner = cursor.fetchone()
            if not document_owner:
                return Response({"error": "File metadata not found"}, status=404)
            invitation_id, vendor_id = document_owner
            if actor['role'] == 'employee':
                require_bid_document_access(actor, invitation_id)
            elif actor['role'] != 'vendor' or actor['vendor_id'] != vendor_id:
                raise PermissionDenied('Энэ баримт бичгийг харах эрхгүй байна.')
        result = TenderService.get_file_path(sourceid, sourcetype)
        if result['retType'] != 0:
            return Response({"error": result['retMsg']}, status=400)
        return Response({"data": result['retData']}, status=200)

    except APIException:
        raise
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def upload_tender_join_document_view(request):
    uploaded_file = request.FILES.get('file')
    required_fields = ['tenderid', 'invitationid', 'vendorid', 'createdby']
    missing = [field for field in required_fields if not request.data.get(field)]
    if uploaded_file is None:
        missing.append('file')
    if missing:
        return Response({"error": f"Missing fields: {', '.join(missing)}"}, status=400)

    try:
        requirement_type_id = int(request.data.get('requiretypeid', 0))
    except (TypeError, ValueError):
        return Response({"error": "Invalid requiretypeid"}, status=400)
    if requirement_type_id not in {0, *REQUIRED_VENDOR_DOCUMENT_TYPE_IDS}:
        return Response({"error": "Unknown document type"}, status=400)

    source_type = 'TenderJoinDoc'
    extension = Path(uploaded_file.name).suffix.lower()
    if extension not in {'.pdf', '.doc', '.docx', '.xls', '.xlsx'}:
        return Response({"error": "Only PDF, DOC, DOCX, XLS and XLSX files are allowed"}, status=400)
    if uploaded_file.size > 10 * 1024 * 1024:
        return Response({"error": "File size must not exceed 10MB"}, status=400)
    stored_name = f"{uuid4()}{extension}"
    storage_dir = (Path(settings.BASE_DIR) / 'Files' / source_type).resolve()
    storage_dir.mkdir(parents=True, exist_ok=True)
    target_path = (storage_dir / stored_name).resolve()
    if storage_dir not in target_path.parents:
        return Response({"error": "Invalid file path"}, status=400)

    replaced_paths = []
    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                if requirement_type_id in REQUIRED_VENDOR_DOCUMENT_TYPE_IDS:
                    cursor.execute(
                        '''
                        SELECT document.joindocid, file.filepath
                        FROM tbltenderjoindoc document
                        LEFT JOIN tblfiles file
                          ON file.sourceid=document.joindocid AND file.sourcetype=%s
                        WHERE document.invitationid=%s AND document.vendorid=%s
                          AND document.requiretypeid=%s
                        ''',
                        [source_type, int(request.data['invitationid']), int(request.data['vendorid']), requirement_type_id],
                    )
                    replaced = cursor.fetchall()
                    replaced_ids = [row[0] for row in replaced]
                    replaced_paths = [row[1] for row in replaced if row[1]]
                    if replaced_ids:
                        cursor.execute(
                            'DELETE FROM tblfiles WHERE sourcetype=%s AND sourceid=ANY(%s)',
                            [source_type, replaced_ids],
                        )
                        cursor.execute(
                            'DELETE FROM tbltenderjoindoc WHERE joindocid=ANY(%s)',
                            [replaced_ids],
                        )
                cursor.execute("""
                    INSERT INTO TBLTENDERJOINDOC
                    (documentname, tenderid, invitationid, vendorid, created, createdby, requiretypeid, batchid)
                    VALUES (%s, %s, %s, %s, TO_CHAR(CURRENT_TIMESTAMP, 'YYYY.MM.DD HH24:MI:SS'), %s, %s, %s)
                    RETURNING joindocid
                """, [
                    Path(uploaded_file.name).name,
                    int(request.data['tenderid']),
                    int(request.data['invitationid']),
                    int(request.data['vendorid']),
                    request.data['createdby'],
                    requirement_type_id,
                    int(request.data.get('batchid', 0)),
                ])
                document_id = cursor.fetchone()[0]
                cursor.execute("""
                    INSERT INTO TBLFILES (filename, filetype, filepath, sourceid, sourcetype)
                    VALUES (%s, %s, %s, %s, %s)
                """, [Path(uploaded_file.name).name, extension, stored_name, document_id, source_type])

            with target_path.open('wb') as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)
    except Exception as ex:
        target_path.unlink(missing_ok=True)
        return Response({"error": str(ex)}, status=500)

    for replaced_path in replaced_paths:
        old_target = (storage_dir / replaced_path).resolve()
        if storage_dir in old_target.parents:
            old_target.unlink(missing_ok=True)

    return Response({
        "data": {
            "documentid": document_id,
            "filename": Path(uploaded_file.name).name,
            "sourceid": document_id,
            "sourcetype": source_type,
        }
    }, status=201)

@api_view(['POST'])
def save_tender_draft_details_view(request):
    flags = getattr(request, 'tender_permission_flags', {})
    can_manage_committee = bool(flags.get('isAdmin') or flags.get('isCommitteeManage'))
    return _save_tender_draft_details(request.data, sync_members=can_manage_committee)


def _save_tender_draft_details(data, sync_members=True):
    from api.services.workflow_service import local_datetime
    missing = [field for field in ('tenderid', 'invitationid') if not data.get(field)]
    if missing:
        return Response({"error": f"Missing fields: {', '.join(missing)}"}, status=400)

    try:
        accept_date = local_datetime(data.get('acceptdate'))
        open_date = local_datetime(data.get('opendate'))
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT invitationid FROM TBLINVITATION WHERE invitationid=%s AND tenderid=%s",
                    [data['invitationid'], data['tenderid']],
                )
                if not cursor.fetchone():
                    return Response({"error": "Тендерийн урилга олдсонгүй."}, status=404)

                _replace_portal_tender_details(cursor, data, sync_members=sync_members)
                cursor.execute("""
                    UPDATE TBLINVITATION
                    SET acceptdate=%s, opendate=%s, description=%s, note=%s
                    WHERE invitationid=%s AND tenderid=%s
                """, [
                    accept_date,
                    open_date,
                    data.get('description', ''),
                    data.get('note', ''),
                    data['invitationid'],
                    data['tenderid'],
                ])
    except ValueError as ex:
        return Response({"error": str(ex) or "Урилгын өгөгдөл буруу байна."}, status=400)
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

    return Response({"retType": 0, "retMsg": "", "retData": data['invitationid']})


@api_view(['POST'])
def save_tender_committee_view(request):
    invitation_id = request.data.get('invitationid')
    members = request.data.get('members')
    if not invitation_id or not isinstance(members, list):
        return Response({"error": "Урилга болон хорооны гишүүд шаардлагатай."}, status=400)
    try:
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM TBLINVITATION WHERE invitationid=%s",
                [invitation_id],
            )
            if not cursor.fetchone():
                return Response({"error": "Тендерийн урилга олдсонгүй."}, status=404)
            _sync_portal_committee(
                cursor,
                invitation_id,
                members,
                request.audit_actor['username'],
            )
    except (TypeError, ValueError) as ex:
        return Response({"error": str(ex) or "Үнэлгээний хорооны мэдээлэл буруу байна."}, status=400)
    return Response({"retType": 0, "retMsg": "", "retData": invitation_id})


@api_view(['POST'])
def save_portal_tender_view(request):
    """One user save, one audit event, one transaction for all tender fields."""
    from api.services.audit_service import response_failed
    if request.audit_actor['role'] != 'employee':
        return Response({'error': 'Ажилтны эрх шаардлагатай.'}, status=403)
    payload = request.data
    header = dict(payload.get('header', {}))
    details = dict(payload.get('details', {}))
    if not header or not details:
        return Response({'error': 'Тендерийн мэдээлэл дутуу байна.'}, status=400)
    is_new = int(header.get('tenderid') or 0) == 0
    if is_new and not _has_portal_draft_content(header, details):
        return Response({
            'retType': 1,
            'retMsg': 'Ноорог үүсгэхийн тулд багадаа нэг талбарт мэдээлэл оруулна уу.',
            'retData': None,
        }, status=400)
    # The outer audited wrapper supplies the transaction and verified identity.
    header['createdby'] = request.audit_actor['username']
    result = TenderService().save_tender(header)
    response = Response(result)
    if response_failed(response):
        return response
    tender_id = result['retData']
    result = TenderService.save_invitation_header(tender_id, header['createdby'], details.get('invitationid', 0))
    response = Response(result)
    if response_failed(response):
        return response
    invitations = result.get('retData', [None])[0] or []
    if not invitations:
        return Response({'error': 'Тендерийн урилга олдсонгүй.'}, status=400)
    invitation = invitations[0]
    details.update(tenderid=tender_id, invitationid=invitation['invitationid'], createdby=header['createdby'])
    flags = getattr(request, 'tender_permission_flags', {})
    can_manage_committee = bool(flags.get('isAdmin') or flags.get('isCommitteeManage'))
    response = _save_tender_draft_details(details, sync_members=can_manage_committee)
    if response_failed(response):
        return response
    return Response({'retType': 0, 'retData': {
        'tenderid': tender_id, 'invitationid': invitation['invitationid'],
        'invitationcode': invitation.get('invitationcode', ''),
        'requirements': details.get('requirements', []),
    }})


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def upload_tender_document_view(request):
    uploaded_file = request.FILES.get('file')
    required_fields = ['tenderid', 'invitationid', 'createdby']
    missing = [field for field in required_fields if not request.data.get(field)]
    if uploaded_file is None:
        missing.append('file')
    if missing:
        return Response({"error": f"Missing fields: {', '.join(missing)}"}, status=400)

    source_type = 'TenderDoc'
    extension = Path(uploaded_file.name).suffix.lower()
    stored_name = f"{uuid4()}{extension}"
    storage_dir = (Path(settings.BASE_DIR) / 'Files' / source_type).resolve()
    storage_dir.mkdir(parents=True, exist_ok=True)
    target_path = (storage_dir / stored_name).resolve()

    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                requested_doc_type = int(request.data.get('doctypeid', 9))
                cursor.execute(
                    "SELECT doctypeid FROM TBLTENDERDOCTYPE WHERE doctypeid=%s",
                    [requested_doc_type],
                )
                document_type = cursor.fetchone()
                if not document_type:
                    cursor.execute("SELECT doctypeid FROM TBLTENDERDOCTYPE ORDER BY doctypeid LIMIT 1")
                    document_type = cursor.fetchone()
                if not document_type:
                    return Response({"error": "Тендерийн баримтын төрөл тохируулаагүй байна."}, status=400)

                cursor.execute("""
                    INSERT INTO TBLTENDERDOC
                    (documentcode, documentname, doctypeid, batchid, tenderid, invitationid, created, createdby, joinworkid)
                    VALUES (%s, %s, %s, %s, %s, %s, TO_CHAR(CURRENT_TIMESTAMP, 'YYYY.MM.DD HH24:MI:SS'), %s, 0)
                    RETURNING docid
                """, [
                    '', Path(uploaded_file.name).name, int(document_type[0]), int(request.data.get('batchid', 0)),
                    int(request.data['tenderid']), int(request.data['invitationid']), request.data['createdby'],
                ])
                document_id = cursor.fetchone()[0]
                cursor.execute("""
                    INSERT INTO TBLFILES (filename, filetype, filepath, sourceid, sourcetype)
                    VALUES (%s, %s, %s, %s, %s)
                """, [Path(uploaded_file.name).name, extension, stored_name, document_id, source_type])
            with target_path.open('wb') as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)
    except Exception as ex:
        target_path.unlink(missing_ok=True)
        return Response({"error": str(ex)}, status=500)

    return Response({"data": {"documentid": document_id, "filename": Path(uploaded_file.name).name}}, status=201)

@api_view(['POST'])
def publish_tender_from_portal_view(request):
    data = request.data
    criteria = data.get('criteria', [])
    total_weight = sum(float(item.get('weight', 0)) for item in criteria)
    if round(total_weight, 4) != 100:
        return Response({"error": "Шалгуурын нийт жин 100% байх ёстой."}, status=400)
    required = ['tenderid', 'invitationid', 'acceptdate', 'opendate', 'publishdate', 'description']
    missing = [field for field in required if not data.get(field)]
    if missing:
        return Response({"error": f"Missing fields: {', '.join(missing)}"}, status=400)

    try:
        accept_date = datetime.fromisoformat(str(data['acceptdate']).replace('Z', ''))
        open_date = datetime.fromisoformat(str(data['opendate']).replace('Z', ''))
        publish_date = datetime.fromisoformat(str(data['publishdate']).replace('Z', ''))
        if open_date <= accept_date:
            return Response({"error": "Санал нээх хугацаа эцсийн хугацаанаас хойш байна."}, status=400)

        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT 1
                    FROM TBLTENDER t
                    INNER JOIN TBLVENDORACTIVITY a ON a.activityid=t.activityid
                    WHERE t.tenderid=%s
                    """,
                    [data['tenderid']],
                )
                if not cursor.fetchone():
                    return Response(
                        {"error": "Тендерийн үйл ажиллагааны чиглэлийг сонгоно уу."},
                        status=400,
                    )
                _replace_portal_tender_details(cursor, data)
                cursor.execute("""
                    UPDATE TBLINVITATION SET acceptdate=%s, opendate=%s, description=%s, status=1
                    WHERE invitationid=%s AND tenderid=%s
                """, [accept_date, open_date, data['description'], data['invitationid'], data['tenderid']])
                cursor.execute("UPDATE TBLTENDER SET publishdate=%s WHERE tenderid=%s", [publish_date.date(), data['tenderid']])
    except ValueError as ex:
        return Response({"error": str(ex) or "Тендерийн өгөгдөл буруу байна."}, status=400)
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

    return Response({"retType": 0, "retMsg": "", "retData": data['invitationid']})

@api_view(['GET'])
def download_file_view(request):
    source_id = request.GET.get('sourceid')
    source_type = request.GET.get('sourcetype', '')
    allowed_source_types = {'TenderDoc', 'TenderJoinDoc', 'VendorCompanyDoc'}
    if not source_id or source_type not in allowed_source_types:
        return Response({"error": "Valid sourceid and sourcetype are required"}, status=400)

    if source_type == 'TenderJoinDoc':
        try:
            actor = verified_actor(request)
        except ValueError:
            raise AuthenticationFailed('Дахин нэвтэрнэ үү.')
        with connection.cursor() as cursor:
            cursor.execute(
                'SELECT invitationid,vendorid FROM tbltenderjoindoc WHERE joindocid=%s',
                [source_id],
            )
            document_owner = cursor.fetchone()
        if not document_owner:
            return Response({"error": "File metadata not found"}, status=404)
        invitation_id, vendor_id = document_owner
        if actor['role'] == 'employee':
            require_bid_document_access(actor, invitation_id)
        elif actor['role'] != 'vendor' or actor['vendor_id'] != vendor_id:
            raise PermissionDenied('Энэ баримт бичгийг харах эрхгүй байна.')

    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT filename, filepath
            FROM TBLFILES
            WHERE sourceid = %s AND sourcetype = %s
            ORDER BY fileid DESC
            LIMIT 1
        """, [source_id, source_type])
        row = cursor.fetchone()
    if not row:
        return Response({"error": "File metadata not found"}, status=404)

    original_name, stored_name = row
    storage_dir = (Path(settings.BASE_DIR) / 'Files' / source_type).resolve()
    target_path = (storage_dir / stored_name).resolve()
    if storage_dir not in target_path.parents or not target_path.is_file():
        return Response({"error": "Physical file not found on this server"}, status=404)

    content_type = mimetypes.guess_type(original_name)[0] or 'application/octet-stream'
    return FileResponse(target_path.open('rb'), as_attachment=True, filename=original_name, content_type=content_type)
    
@api_view(['POST'])
def delete_file_view(request):
    try:
        sourceid = int(request.data.get('sourceid', 0))
        sourcetype = request.data.get('sourcetype', '')
        if sourceid == 0 or sourcetype == "":
            return Response({"error": "sourceid and sourcetype required"}, status=400)
        result = TenderService.delete_file(sourceid, sourcetype)
        if result["retType"] != 0:
            return Response({"error": result["retMsg"]}, status=400)
        return Response({"data": result["retData"]}, status=200)

    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

@api_view(['GET'])
def get_tender_doc_initial_data_view(request):
    try:
        docid = int(request.GET.get("docid", 0))
        invitationid = int(request.GET.get("invitationid", 0))
        if docid == 0:
            return Response({"error": "docid is required"}, status=400)
        result = TenderService.get_tender_doc_initial_data(docid, invitationid)
        if result["retType"] != 0:
            return Response({"error": result["retMsg"]}, status=400)
        return Response({"data": result["retData"]}, status=200)

    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

@api_view(['GET'])
def get_criteria_list_view(request):
    try:
        invitationid = int(request.GET.get("invitationid", 0))
        joinworkid = int(request.GET.get("joinworkid", 0))
        if invitationid == 0 and joinworkid == 0:
            return Response({"error": "invitationid or joinworkid is required"}, status=400)
        result = TenderService.get_criteria_list(invitationid, joinworkid)
        if result["retType"] != 0:
            return Response({"error": result["retMsg"]}, status=400)
        return Response({"data": result["retData"]}, status=200)

    except Exception as ex:
        return Response({"error": str(ex)}, status=500)
    
@api_view(['POST'])
def save_criteria_view(request):
    try:
        param = request.data
        result = TenderService.save_criteria(param)
        if result["retType"] != 0:
            return Response({"error": result["retMsg"]}, status=400)
        return Response({"criteriaid": result["retData"]}, status=200)
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)
    
@api_view(['DELETE'])
def delete_criteria_view(request, criteriaid):
    try:
        result = TenderService.delete_criteria(criteriaid)
        if result["retType"] != 0:
            return Response({"error": result["retMsg"]}, status=400)
        return Response({"deleted_criteriaid": result["retData"]}, status=200)
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)
    
@api_view(['GET'])
def get_criteria_initial_data_view(request):
    try:
        criteriaid = int(request.GET.get("criteriaid", 0))
        if criteriaid == 0:
            return Response({"error": "criteriaid is required"}, status=400)
        result = TenderService.get_criteria_initial_data(criteriaid)
        if result["retType"] != 0:
            return Response({"error": result["retMsg"]}, status=400)
        return Response({"data": result["retData"]}, status=200)
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

@api_view(['GET'])
def get_require_list_view(request):
    try:
        invitationid = int(request.GET.get("invitationid", 0))
        if invitationid == 0:
            return Response({"error": "invitationid is required"}, status=400)
        result = TenderService.get_require_list(invitationid)
        if result["retType"] != 0:
            return Response({"error": result["retMsg"]}, status=400)
        return Response({"data": result["retData"]}, status=200)
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

@api_view(['POST'])
def save_require_view(request):
    try:
        param = request.data
        if "invitationid" not in param or "requirename" not in param or "requiretypeid" not in param:
            return Response({"error": "Missing required fields"}, status=400)
        result = TenderService.save_require(param)
        if result["retType"] != 0:
            return Response({"error": result["retMsg"]}, status=400)
        return Response({"requireid": result["retData"]}, status=200)
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)
    
@api_view(['DELETE'])
def delete_require_view(request, requireid):
    try:
        result = TenderService.delete_require(requireid)
        if result["retType"] != 0:
            return Response({"error": result["retMsg"]}, status=400)
        return Response({"message": f"Require ID {requireid} deleted successfully"}, status=200)
    except Exception as ex:
        return Response({"error": str(ex)}, status=500)

@api_view(['GET'])
def get_require_initial_data_view(request, requireid):
    result = TenderService.get_require_initial_data(requireid)
    if result["retType"] != 0:
        return Response({"error": result["retMsg"]}, status=400)
    return Response({"retData": result["retData"]}, status=200)

@api_view(['GET'])
def get_note_list_view(request):
    invitationid = int(request.GET.get("invitationid", 0))
    joinworkid = int(request.GET.get("joinworkid", 0))
    result = TenderService.get_note_list(invitationid, joinworkid)
    if result["retType"] != 0:
        return Response({"error": result["retMsg"]}, status=400)
    return Response({"retData": result["retData"]})

@api_view(["POST"])
def save_note_view(request):
    param = request.data
    result = TenderService.save_note(param)
    if result["retType"] != 0:
        return Response({"error": result["retMsg"]}, status=400)
    return Response({"noteid": result["retData"]})

@api_view(["DELETE"])
def delete_note_view(request, noteid: int):
    result = TenderService.delete_note(noteid)
    if result["retType"] != 0:
        return Response({"error": result["retMsg"]}, status=400)
    return Response({"message": f"Note {noteid} deleted successfully."})

@api_view(["GET"])
def get_note_initial_data_view(request, noteid: int):
    result = TenderService.get_note_initial_data(noteid)
    if result["retType"] != 0:
        return Response({"error": result["retMsg"]}, status=400)
    return Response(result["retData"])

@api_view(['POST'])
def save_join_work_product_requirement_view(request):
    data = request.data
    joinworkid = data.get("joinworkid")
    products_requirements = data.get("products_requirements", "")
    owners_product_supply = data.get("owners_product_supply", "")

    result = TenderService.save_join_work_product_requirement(joinworkid, products_requirements, owners_product_supply)
    return Response(result)

@api_view(['GET'])
def get_join_work_list_expired_view(request):
    result = TenderService.get_join_work_list_expired()
    return Response(result)

@api_view(['GET'])
def get_join_work_list_view(request):
    result = TenderService.get_join_work_list()
    return Response(result)

@api_view(['GET'])
def get_join_work_by_id_view(request, joinworkid):
    result = TenderService.get_join_work_by_id(joinworkid)
    return Response(result)

@api_view(['DELETE'])
def delete_join_work_view(request, joinworkid):
    result = TenderService.delete_join_work(joinworkid)
    return Response(result)

@api_view(['POST'])
def save_join_work_view(request):
    result = TenderService.save_join_work(request.data)
    return Response(result)

@api_view(['POST'])
def publish_join_work_invitation_view(request):
    joinworkid = request.data.get("joinworkid")
    status = request.data.get("status")
    result = TenderService.publish_join_work_invitation(joinworkid, status)

    return Response(result)

@api_view(['GET'])
def get_join_work_list_for_vendor_view(request, vendorid):
    result = TenderService.get_join_work_list_for_vendor(vendorid)
    return Response(result)

@api_view(['GET'])
def get_join_work_list_involved_view(request, vendorid):
    result = TenderService.get_join_work_list_involved(vendorid)

    return Response(result)

@api_view(['POST'])
def send_join_work_of_vendor_view(request):
    vendorid = request.data.get("vendorid")
    joinworkid = request.data.get("joinworkid")
    status = request.data.get("status")
    createdby = request.data.get("createdby")

    result = TenderService.send_join_work_of_vendor(
        vendorid,
        joinworkid,
        status,
        createdby
    )

    return Response(result)


@api_view(['GET'])
def get_join_work_list_received_list_view(request, joinworkid):
    #Get list of vendors who submitted JoinWork documents
    result = TenderService.get_join_work_list_received_list(joinworkid)
    return Response(result)

@api_view(['GET'])
def get_join_work_initial_data_view(request, joinworkid):
    #Returns initial data required to edit/view JoinWork

    result = TenderService.get_join_work_initial_data(joinworkid)
    return Response(result)

@api_view(['GET'])
def get_join_work_task_list_view(request, joinworkid):
    result = TenderService.get_join_work_task_list(joinworkid)
    return Response(result)

@api_view(['GET'])
def get_join_work_task_view(request, jointaskid):
    result = TenderService.get_join_work_task(jointaskid)
    return Response(result)

@api_view(['DELETE'])
def delete_join_work_task_view(request, jointaskid):
    result = TenderService.delete_join_work_task(jointaskid)
    return Response(result)

@api_view(['POST'])
def save_join_work_task_view(request):
    """
    Create or update a JoinWork task
    Request body :
    {
        "jointaskid": 0,           # 0 for new task
        "joinworkid": 5,
        "taskname": "Task Name",
        "taskdetail": "Task detail"
    }
    """
    data = request.data
    result = TenderService.save_join_work_task(data)

    return Response(result)


@api_view(['POST'])
def save_vendor_view(request):
    #Save or update vendor.
    #Request JSON should include all vendor fields and 'vendorcategory_ids' (comma-separated) and 'password'.
    
    data = request.data
    result = TenderService.save_vendor(data)
    return Response(result)

@api_view(['GET'])
def get_vendor_info_view(request, vendorid):
    result = TenderService.get_vendor_info(vendorid)
    return Response(result)

@api_view(['GET'])
def get_vendor_category_view(request, vendorid):
    result = TenderService.get_vendor_category(vendorid)
    return Response(result)

@api_view(['GET'])
def get_all_vendors_category_view(request):
    result = TenderService.get_all_vendors_category()
    return Response(result)

@api_view(['GET'])
def get_vendors_view(request):
    result = TenderService.get_vendors()
    return Response(result)

@api_view(['POST'])
def create_file_view(request):
    try:
        file_data = request.data
        uploaded_file = TenderService.create_file_from_base64(
            base64_file=file_data['base64File'],
            file_name=file_data['fileName'],
            file_ext=file_data['fileExt']
        )
        # Return basic info for testing
        result = {
            "RetType": 0,
            "RetMsg": "File created successfully",
            "fileName": uploaded_file.name,
            "fileSize": uploaded_file.size
        }
    except Exception as ex:
        result = {
            "RetType": 1,
            "RetMsg": str(ex)
        }
    return Response(result)

@api_view(['POST'])
def send_email_view(request):
    mail_data = request.data
    result = email_service.send_email(mail_data)
    return Response(result)

@api_view(['POST'])
def save_comment_view(request):
    comment_data = request.data
    result = TenderService.save_comment(comment_data)
    return Response(result)

@api_view(['GET'])
def get_comment_count_view(request, invitationid):
    result = TenderService.get_comment_count(invitationid)
    return Response(result)

@api_view(['GET'])
def get_comments_view(request, invitationid, vendorid):
    result = TenderService.get_comments(invitationid, vendorid)
    return Response(result)

@api_view(['GET'])
def get_qoute_list_view(request, invitationid, vendorid):
    result = TenderService.get_qoute_list(invitationid, vendorid)
    return Response(result)

@api_view(['GET'])
def get_qoute_by_id_view(request, qouteid, tenderid):
    result = TenderService.get_qoute_by_id(qouteid, tenderid)
    return Response(result)

@api_view(['DELETE'])
def delete_qoute_view(request, qouteid):
    result = TenderService.delete_qoute(qouteid)
    return Response(result)

@api_view(['POST'])
def save_qoute_view(request):
    qoute_data = request.data
    result = TenderService.save_qoute(qoute_data)
    return Response(result)

@api_view(['GET'])
def get_vendor_list_view(request):
    result = TenderService.get_vendor_list()
    return Response(result)

@api_view(['GET'])
def get_vendor_by_id_view(request, vendorid):
    result = TenderService.get_vendor_by_id(vendorid)
    return Response(result)

@api_view(['GET'])
def get_vendor_updated_view(request):
    result = TenderService.get_vendor_updated()
    return Response(result)

@api_view(['GET'])
def get_tender_type_list_view(request):
    result = TenderService.get_tender_type_list()
    return Response(result)

@api_view(['POST'])
def save_tender_type_view(request):
    tender_types = request.data 
    result = TenderService.save_tender_type(tender_types)
    return Response(result)

@api_view(['DELETE'])
def delete_tender_type_view(request, tendertypeid):
    result = TenderService.delete_tender_type(tendertypeid)
    return Response(result)

@api_view(['GET'])
def get_department_list_view(request):
    result = TenderService.get_department_list()
    return Response(result)

@api_view(['POST'])
def save_department_view(request):
    departments = request.data 
    result = TenderService.save_department(departments)
    return Response(result)

@api_view(['DELETE'])
def delete_department_view(request, departmentid):
    try:
        result = TenderService.delete_department(departmentid)
        return Response(result)
    except Exception as ex:
        return Response({
            "ret_type": 1,
            "ret_msg": str(ex)
        })
    
@api_view(['GET'])
def get_purchase_type_list_view(request):
    result = TenderService.get_purchase_type_list()
    return Response(result)    

@api_view(['POST'])
def save_purchase_type_view(request):
    data = request.data
    if not isinstance(data, list):
        return Response({
            "ret_type": 1,
            "ret_msg": "Body must be an array"
        })
    result = TenderService.save_purchase_type(data)
    return Response(result)

@api_view(['DELETE'])
def delete_purchase_type_view(request, purchasetypeid):
    result = TenderService.delete_purchase_type(purchasetypeid)
    return Response(result)

@api_view(['GET'])
def get_require_type_list_view(request):
    result = TenderService.get_require_type_list()
    return Response(result)

@api_view(['POST'])
def save_require_type_view(request):
    data = request.data
    if not isinstance(data, list):
        return Response({
            "ret_type": 1,
            "ret_msg": "Body must be an array"
        })
    result = TenderService.save_require_type(data)

    return Response(result)

@api_view(['DELETE'])
def delete_require_type_view(request, id):
    result = TenderService.delete_require_type(id)
    return Response(result)

@api_view(['GET'])
def get_criteria_type_list_view(request):
    result = TenderService.get_criteria_type_list()
    return Response(result)

@api_view(['POST'])
def save_criteria_type_view(request):
    data = request.data
    if not isinstance(data, list):
        return Response({
            "ret_type": 1,
            "ret_msg": "Body must be an array"
        })
    result = TenderService.save_criteria_type(data)

    return Response(result)

@api_view(['DELETE'])
def delete_criteria_type_view(request, criteriatypeid):
    result = TenderService.delete_criteria_type(criteriatypeid)
    return Response(result)

@api_view(['GET'])
def get_tender_doc_type_list_view(request):
    result = TenderService.get_tender_doc_type_list()
    return Response(result)

@api_view(['POST'])
def save_tender_doc_type_view(request):
    data = request.data
    if not isinstance(data, list):
        return Response({
            "ret_type": 1,
            "ret_msg": "Body must be an array"
        })

    result = TenderService.save_tender_doc_type(data)
    return Response(result)

@api_view(['DELETE'])
def delete_tender_doc_type_view(request, doctypeid):
    result = TenderService.delete_tender_doc_type(doctypeid)
    return Response(result)

@api_view(['GET'])
def get_member_type_list_view(request):
    result = TenderService.get_member_type_list()
    return Response(result)


@api_view(['POST'])
def save_member_type_view(request):
    data = request.data
    if not isinstance(data, list):
        return Response({
            "ret_type": 1,
            "ret_msg": "Body must be an array"
        })
    result = TenderService.save_member_type(data)
    return Response(result)

@api_view(['DELETE'])
def delete_member_type_view(request, membertypeid):
    result = TenderService.delete_member_type(membertypeid)
    return Response(result)

@api_view(['GET'])
def get_vendor_activity_list_view(request):
    result = TenderService.get_vendor_activity_list()
    return Response(result)

@api_view(['POST'])
def save_vendor_activity_view(request):
    data = request.data
    if not isinstance(data, list):
        return Response({
            "ret_type": 1,
            "ret_msg": "Body must be an array"
        })
    result = TenderService.save_vendor_activity(data)
    return Response(result)

@api_view(['DELETE'])
def delete_vendor_activity_view(request, activityid):
    result = TenderService.delete_vendor_activity(activityid)
    return Response(result)

@api_view(['GET'])
def get_vendor_sub_activity_list_view(request):
    result = TenderService.get_vendor_sub_activity_list()
    return Response(result)

@api_view(['POST'])
def save_vendor_sub_activity_view(request):
    data = request.data
    if not isinstance(data, list):
        return Response({
            "ret_type": 1,
            "ret_msg": "Body must be an array"
        })

    result = TenderService.save_vendor_sub_activity(data)
    return Response(result)

@api_view(['DELETE'])
def delete_vendor_sub_activity_view(request, subactivityid):
    result = TenderService.delete_vendor_sub_activity(subactivityid)
    return Response(result)

@api_view(['GET'])
def email_cc_list_view(request):
    result = TenderService.get_email_cc_list()
    return Response(result)

@api_view(['POST'])
def save_email_cc_view(request):
    data_list = request.data  
    result = TenderService.save_email_cc(data_list)
    return Response(result)

@api_view(['DELETE'])
def delete_email_cc_view(request, email_id):
    result = TenderService.delete_email_cc(email_id)
    return Response(result)

@api_view(['GET'])
def code_list_view(request):
    result = TenderService.get_code_list()
    return Response(result)

@api_view(['POST'])
def save_code_view(request):
    data_list = request.data  
    result = TenderService.save_code(data_list)
    return Response(result)

@api_view(['DELETE'])
def delete_code_view(request, code_id):
    result = TenderService.delete_code(code_id)
    return Response(result)

@api_view(['GET'])
def permission_view(request, empid):
    result = TenderService.get_permission(empid)
    return Response(result)

@api_view(['GET'])
def settings_view(request):
    result = TenderService.get_settings()
    return Response(result)

@api_view(['POST'])
def save_settings_view(request):
    data_list = request.data 
    result = TenderService.save_settings(data_list)
    return Response(result)

@api_view(['DELETE'])
def delete_setting_view(request, setting_id):
    result = TenderService.delete_setting(setting_id)
    return Response(result)

@api_view(['POST'])
def tender_open_log_view(request):
    empid = request.data.get('empid')
    invitationid = request.data.get('invitationid')
    result = TenderService.tender_open_log(empid, invitationid)
    return Response(result)

@api_view(['POST'])
def obtain_erp_session_view(request):
    url = request.data.get("url")
    if not url:
        return Response({"RetType": 1, "RetMsg": "ERP URL is required", "session_id": ""})

    session_id = obtain_erp_session(url)
    if session_id:
        return Response({"RetType": 0, "RetMsg": "Success", "session_id": session_id})
    else:
        return Response({"RetType": 1, "RetMsg": "Failed to obtain ERP session", "session_id": ""})

@api_view(['POST'])
def get_vendor_category_view(request):
    url = request.data.get("url")
    if not url:
        return Response({"RetType": 1, "RetMsg": "ERP URL is required", "RetData": []})
    
    result = TenderService.get_vendor_category(url)
    return Response(result)

@api_view(['GET'])
def get_tender_open_log_view(request, invitationid: int):
    result = TenderService.get_tender_open_log(invitationid)
    return Response(result)

@api_view(['POST'])
def get_members_view(request):
    invitationid = request.data.get("invitationid")
    base_url = request.data.get("url")
    if not invitationid or not base_url:
        return Response({"RetType": 1, "RetMsg": "invitationid and url are required", "RetData": []})
    
    result = TenderService.get_members(invitationid, base_url)
    return Response(result)

@api_view(['GET'])
def get_member_by_id_view(request, evaluationid: int):
    result = TenderService.get_member_by_id(evaluationid)
    return Response(result)

@api_view(['DELETE'])
def delete_member_view(request, evaluationid: int):
    result = TenderService.delete_member(evaluationid)
    return Response(result)

@api_view(['POST'])
def save_members_view(request):
    members = request.data
    result = TenderService.save_members(members)
    return Response(result)

@api_view(['POST'])
def get_emp_list_view(request):
    param = request.data
    result = TenderService.get_emp_list(param)
    return Response(result)

@api_view(['GET'])
def get_employees_view(request):
    result = TenderService.get_employees()
    return Response(result)

@api_view(['GET'])
def get_vendor_notifications_view(request):
    try:
        actor = verified_actor(request)
    except ValueError:
        return Response(
            {"ret_type": 1, "ret_msg": "Нэвтрэх эрх хүчингүй байна.", "ret_data": []},
            status=401,
        )
    if actor.get('role') != 'vendor' or not actor.get('vendor_id'):
        return Response(
            {"ret_type": 1, "ret_msg": "Нийлүүлэгчийн эрх шаардлагатай.", "ret_data": []},
            status=403,
        )
    result = TenderService.get_vendor_notifications(actor['vendor_id'])
    return Response(result)

@api_view(['GET'])
def get_log_record_list_view(request):
    result = TenderService.get_log_record_list()
    return Response(result)

@api_view(['GET'])
def get_vendor_company_doc_list_view(request, vendorid):
    result = TenderService.get_vendor_company_doc_list(vendorid)
    return Response(result)

@api_view(['POST'])
def change_password_to_salt_view(request):
    result = TenderService.change_password_to_salt()
    return Response(result)

@api_view(['POST'])
def save_master_contract_requirement_view(request):
    param = request.data
    result = TenderService.save_master_contract_requirement(param)
    return Response(result)

@api_view(['GET'])
def get_master_contract_req_detail_data_view(request, mastercontractreqid):
    result = TenderService.get_master_contract_req_detail_data(mastercontractreqid)
    return Response(result)

@api_view(['GET'])
def get_master_contract_req_list_view(request):
    result = TenderService.get_master_contract_req_list()
    return Response(result)

@api_view(['DELETE'])
def delete_master_contract_req_view(request, mastercontractreqid):
    result = TenderService.delete_master_contract_req(mastercontractreqid)
    return Response(result)
