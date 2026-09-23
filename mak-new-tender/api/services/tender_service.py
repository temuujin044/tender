from django.db.models import F, Value , Q , OuterRef, Subquery , Exists , Sum
from django.db.models.functions import Concat, Cast
from api.models import Tbltender , Tbldepartment , Tbltendertype , Tblpurchasetype , Tblinvitation , Tbltenderbatch , Tbltenderdelay, Tblcriteria , Tblvendor , Tbltenderopen , Tblinvevaluate, Tblinvitationofvendor , Tbltenderjoindoc,Tblemailcc,Tblevaluation,Tbltenderdoc,Tblfiles,Tblrequire,Tblnotes, TenderEvaluationStatus, TenderVendorEvaluation
from django.db.models.expressions import RawSQL
from django.db import transaction , connection
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from api.utils.db_helper import execute_query
import re, traceback , os , secrets , hashlib , io , base64 , requests
from api.utils.service_helper import run_service 
from api.services.user_service import get_users_invitation_ids , obtain_erp_session
from api.services.activity_matching_service import (
    activity_names,
    normalize_activity_ids,
    sync_tender_activities,
    sync_vendor_activities,
)
from datetime import datetime
from api.serializers.tender_serializer import (
    TenderTypeSerializer,
    PurchaseTypeSerializer,
    DepartmentSerializer,
    TenderBatchSerializer,
    TBLTENDERSerializer as TenderSerializer,
    TBLINVITATIONSerializer as InvitationSerializer,
    TenderDelaySerializer
)

from django.core.files.uploadedfile import InMemoryUploadedFile
from api.utils.mime_types import getNextCode
from django.core.mail import EmailMessage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
import logging
from collections import OrderedDict
from decimal import Decimal, InvalidOperation

logger = logging.getLogger(__name__)

PERMISSION_ACTION_CODES = ("TenderEdit", "Committee", "Evaluate", "Publish", "Cancel")

def is_valid(email):
    regex = r'^[^@\s]+@[^@\s]+\.(com|net|org|gov)$'
    return re.match(regex, email, re.IGNORECASE) is not None

def dictfetchall(cursor):
    "Return all rows from a cursor as a list of dicts"
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def resolve_vendor_activity(cursor, activity_id):
    """Backward-compatible single activity resolver for legacy callers."""
    activity_ids = normalize_activity_ids(cursor, activity_id)
    return activity_names(cursor, activity_ids)[0]


class PasswordHasher:
    @staticmethod
    def generate_salt():
        return secrets.token_hex(16)

    @staticmethod
    def compute_hash(password, salt, pepper, iterations=3):
        value = str(password) + str(salt) + str(pepper)
        for _ in range(iterations):
            value = hashlib.sha256(value.encode()).hexdigest()
        return value

class TenderService:

    @staticmethod
    def get_tender_plan_list():
        try:
            dept_name_subq = Tbldepartment.objects.filter(
                departmentid=OuterRef('departmentid')
            ).values('departmentname')[:1]

            tender_type_subq = Tbltendertype.objects.filter(
                tendertypeid=OuterRef('tendertype_id')
            ).values('tendertypename')[:1]

            purchase_type_subq = Tblpurchasetype.objects.filter(
                purchasetypeid=OuterRef('purchasetypeid')
            ).values('purchasetypename')[:1]

            inv_exists = Tblinvitation.objects.filter(
                tender_id=OuterRef('tenderid'),
                status=0
            )

            tenders = Tbltender.objects.annotate(
                departmentname=Subquery(dept_name_subq),
                tendertypename=Subquery(tender_type_subq),
                purchasetypename=Subquery(purchase_type_subq),
                has_invitation=Exists(inv_exists),
                startdate_formatted=RawSQL("TO_CHAR(startdate, 'YYYY.MM.DD')", ()),
                enddate_formatted=RawSQL("TO_CHAR(enddate, 'YYYY.MM.DD')", ()),
                evaluationdate_formatted=RawSQL("TO_CHAR(evaluationdate, 'YYYY.MM.DD')", ()),
                publishdate_formatted=RawSQL("TO_CHAR(publishdate, 'YYYY.MM.DD')", ()),
            ).filter(Q(has_invitation=True) | Q(invitations__isnull=True)) 

            return {"ret_type": 0, "ret_data": list(tenders.values(
                'tenderid', 'tendercode', 'tendername',
                'departmentid', 'departmentname',
                'tendertype_id', 'tendertypename',
                'purchasetypeid', 'purchasetypename',
                'startdate_formatted', 'enddate_formatted',
                'evaluationdate_formatted', 'publishdate_formatted',
            ))}

        except Exception as e:
            return {"ret_type": 1, "ret_msg": str(e)}
    
    def get_tender_list_by_filter(self, filter_data):

        queryset = Tbltender.objects.filter(tenderid__gt=0).select_related("tendertype")

        filter_date = filter_data.get("filterDate")
        tender_name = filter_data.get("tenderName")
        tender_type_id = filter_data.get("tenderTypeID")

        if filter_date:
            queryset = queryset.filter(publishdate__date=filter_date)

        if tender_name:
            queryset = queryset.filter(tendername__icontains=tender_name)

        if tender_type_id:
            queryset = queryset.filter(tendertype_id=tender_type_id)

        return queryset
    
    def get_tender_plan_list_by_filter(self, filter_data):

        queryset = Tbltender.objects.filter(tenderid__gt=0).select_related("tendertype")

        queryset = queryset.filter(
            Q(invitations__invitationid__isnull=True) |
            Q(invitations__status=0)
        )

        filter_date = filter_data.get("filterDate")
        tender_name = filter_data.get("tenderName")
        tender_type_id = filter_data.get("tenderTypeID")

        if filter_date:
            queryset = queryset.filter(publishdate__date=filter_date)

        if tender_name:
            queryset = queryset.filter(tendername__icontains=tender_name)

        if tender_type_id:
            queryset = queryset.filter(tendertype_id=tender_type_id)

        return queryset.distinct()
    
    def delete_tender(self, tenderid):

        result = {"retType": 0, "retMsg": "", "retData": None}

        try:

            if Tblinvitation.objects.filter(tender_id=tenderid).exists():
                result["retType"] = 1
                result["retMsg"] = "Сонгосон тендер дээр урилга үүссэн тул устгах боломжгүй."
                return result

            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM tender_activity_relation WHERE tenderid=%s",
                        [tenderid],
                    )
                Tbltenderbatch.objects.filter(tenderid=tenderid).delete()
                Tbltender.objects.filter(tenderid=tenderid).delete()

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def save_tender(self, data):

        result = {"retType": 0, "retMsg": ""}

        try:

            tenderid = data.get("tenderid", 0)
            batches = []
            for row in data.get("batch", []):
                raw_budget = row.get("budget")
                budget = None
                if raw_budget not in (None, ""):
                    try:
                        budget = Decimal(str(raw_budget).strip())
                    except (InvalidOperation, TypeError, ValueError):
                        raise ValueError("Багц бүрийн төсөвт үнийг зөв оруулна уу.")
                    if not budget.is_finite() or budget <= 0:
                        raise ValueError("Багц бүрийн төсөвт үнэ 0-ээс их байх ёстой.")
                batches.append((row, budget))

            with transaction.atomic():

                activities_supplied = "activityids" in data or "activityid" in data
                activity_ids = []
                if activities_supplied:
                    with connection.cursor() as cursor:
                        activity_ids = normalize_activity_ids(
                            cursor,
                            data.get("activityids", data.get("activityid")),
                            required=False,
                        )
                activityid = activity_ids[0] if activity_ids else None

                Tbltenderbatch.objects.filter(tenderid=tenderid).delete()

                if tenderid == 0:

                    tendercode = getNextCode(
                        1,
                        data.get("tendertypeid"),
                        data.get("departmentid")
                    )

                    tender = Tbltender.objects.create(
                        tendercode=tendercode,
                        tendername=data.get("tendername"),
                        tendertype_id=data.get("tendertypeid"),
                        purchasetypeid=data.get("purchasetypeid"),
                        departmentid=data.get("departmentid"),
                        activityid=activityid,
                        budget=data.get("budget"),
                        evaluationdate=data.get("evaluationdate"),
                        publishdate=data.get("publishdate"),
                        startdate=data.get("startdate"),
                        enddate=data.get("enddate"),
                        createdby=data.get("createdby"),
                        created=timezone.now(),
                        plandate=data.get("plandate")
                    )

                else:

                    tender = Tbltender.objects.get(tenderid=tenderid)

                    tender.tendercode = data.get("tendercode")
                    tender.tendername = data.get("tendername")
                    tender.tendertype_id = data.get("tendertypeid")
                    tender.purchasetypeid = data.get("purchasetypeid")
                    tender.departmentid = data.get("departmentid")
                    if activities_supplied:
                        tender.activityid = activityid
                    tender.budget = data.get("budget")
                    tender.evaluationdate = data.get("evaluationdate")
                    tender.publishdate = data.get("publishdate")
                    tender.startdate = data.get("startdate")
                    tender.enddate = data.get("enddate")
                    tender.plandate = data.get("plandate")

                    tender.save()

                if tenderid == 0 or activities_supplied:
                    with connection.cursor() as cursor:
                        sync_tender_activities(cursor, tender.tenderid, activity_ids)

                for row, budget in batches:

                    batchcode = getNextCode(
                        4,
                        0,
                        data.get("departmentid")
                    )

                    Tbltenderbatch.objects.create(
                        tenderid=tender.tenderid,
                        batchcode=batchcode,
                        batchname=row.get("batchname"),
                        budget=budget,
                    )

                result["retData"] = tender.tenderid

        except Exception as ex:

            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    @staticmethod
    def update_tender_vendor_evaluation_status(data):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": []
        }

        try:
            tenderid = int(data.get("tenderid"))
            vendorid = int(data.get("vendorid"))
            status_code = str(data.get("status", "")).strip().upper()

            if not tenderid or not vendorid or not status_code:
                result["retType"] = 1
                result["retMsg"] = "tenderid, vendorid болон status шаардлагатай."
                return result

            tender = Tbltender.objects.filter(
                tenderid=tenderid
            ).first()

            if not tender:
                result["retType"] = 1
                result["retMsg"] = "Тендер олдсонгүй."
                return result

            vendor = Tblvendor.objects.filter(
                vendorid=vendorid
            ).first()

            if not vendor:
                result["retType"] = 1
                result["retMsg"] = "Харилцагч (Vendor) олдсонгүй."
                return result

            participation = Tblinvitationofvendor.objects.filter(
                tenderid=tenderid,
                vendor_id=vendorid
            ).first()

            if not participation:
                result["retType"] = 1
                result["retMsg"] = "Уг харилцагч энэ тендерт оролцоогүй байна."
                return result

            evaluation_status = TenderEvaluationStatus.objects.filter(
                code=status_code
            ).first()

            if not evaluation_status:
                result["retType"] = 1
                result["retMsg"] = "Ийм статус байхгүй байна."
                return result

            evaluation, created = TenderVendorEvaluation.objects.update_or_create(
                tenderid=tenderid,
                vendorid=vendorid,
                defaults={
                    "invitationid": participation.invitation_id,
                    "status": evaluation_status,
                }
            )

            result["retData"] = {
                "id": evaluation.id,
                "tenderid": tenderid,
                "vendorid": vendorid,
                "invitationid": participation.invitation_id,
                "status": evaluation_status.code,
                "statusName": evaluation_status.name,
                "created": created,
            }

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    @staticmethod
    def get_tender_vendor_evaluation_status(data):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": []
        }

        try:
            tenderid = int(data.get("tenderid"))
            vendorid = int(data.get("vendorid"))

            evaluation = (
                TenderVendorEvaluation.objects
                .select_related("status")
                .filter(
                    tenderid=tenderid,
                    vendorid=vendorid
                )
                .first()
            )

            if not evaluation:
                result["retData"] = {
                    "tenderid": tenderid,
                    "vendorid": vendorid,
                    "status": "NOT_STARTED",
                    "statusName": "Шалгаруулалт эхлээгүй"
                }
                return result

            result["retData"] = {
                "id": evaluation.id,
                "tenderid": evaluation.tenderid,
                "vendorid": evaluation.vendorid,
                "invitationid": evaluation.invitationid,
                "status": evaluation.status.code,
                "statusName": evaluation.status.name,
                "updatedAt": evaluation.updated_at,
            }

        except (TypeError, ValueError):
            result["retType"] = 1
            result["retMsg"] = "tenderid and vendorid must be valid integers."

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result

    @staticmethod
    def get_tender_initial_data(tenderid):
        
        result = {"retType": 0, "retMsg": "", "retData": []}
        try:
            rData = []

            tender_types = Tbltendertype.objects.all()
            rData.append(TenderTypeSerializer(tender_types, many=True).data)

            purchase_types = Tblpurchasetype.objects.all()
            rData.append(PurchaseTypeSerializer(purchase_types, many=True).data)

            departments = Tbldepartment.objects.all()
            rData.append(DepartmentSerializer(departments, many=True).data)

            batches = Tbltenderbatch.objects.filter(tenderid=tenderid).order_by("batchid")
            rData.append(TenderBatchSerializer(batches, many=True).data)

            tender = Tbltender.objects.filter(tenderid=tenderid).first()
            if tender:
                tender_data = dict(TenderSerializer(tender).data)
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT activityid FROM tender_activity_relation WHERE tenderid=%s ORDER BY activityid",
                        [tenderid],
                    )
                    tender_data["activityids"] = [row[0] for row in cursor.fetchall()]
                if not tender_data["activityids"] and tender.activityid:
                    tender_data["activityids"] = [tender.activityid]
                rData.append(tender_data)
            else:
                rData.append(None)

            activities = TenderService.get_vendor_activity_list()
            if activities.get("ret_type") != 0:
                raise ValueError(activities.get("ret_msg") or "Үйл ажиллагааны чиглэл ачаалж чадсангүй.")
            rData.append(activities.get("ret_data", []))

            result["retData"] = rData

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    @staticmethod
    def save_invitation_header(tenderid: int, createdby: str, invitationid: int):

        result = {"retType": 0, "retMsg": "", "retData": [None, None]}

        try:
            rData = [None, None]

            if invitationid != 0:

                invitations = Tblinvitation.objects.filter(
                    tender_id=tenderid
                ).filter(Q(status__isnull=True) | ~Q(status=10))

                rData[0] = InvitationSerializer(invitations, many=True).data

                delays = Tbltenderdelay.objects.filter(
                    invitationid__in=invitations.values_list("invitationid", flat=True)
                )

                rData[1] = TenderDelaySerializer(delays, many=True).data

            else:

                tender = Tbltender.objects.filter(tenderid=tenderid).first()
                departmentid = tender.departmentid if tender else 0

                invitations = Tblinvitation.objects.filter(
                    tender_id=tenderid
                ).filter(Q(status__isnull=True) | ~Q(status=10))

                rData[0] = InvitationSerializer(invitations, many=True).data

                delays = Tbltenderdelay.objects.filter(
                    invitationid__in=invitations.values_list("invitationid", flat=True)
                )

                rData[1] = TenderDelaySerializer(delays, many=True).data

                if not invitations.exists():

                    invitation_code = getNextCode(2, 0, departmentid)

                    new_invitation = Tblinvitation.objects.create(
                        invitationcode=invitation_code,
                        tender_id=tenderid,
                        status_id=0,
                        createdby=createdby,
                        created=timezone.now()
                    )

                    rData[0] = InvitationSerializer([new_invitation], many=True).data
                    rData[1] = []

            result["retData"] = rData

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)
            result["retData"] = [None, None]

        return result
    
    @staticmethod
    def save_invitation(param):

        result = {"retType": 0, "retMsg": ""}

        try:

            invitationid = param.get("invitationid")

            total_weight = Tblcriteria.objects.filter(
                invitationid=invitationid
            ).aggregate(total=Sum("weight"))["total"] or 0

            if total_weight > 100:
                return {
                    "retType": 1,
                    "retMsg": "Уучлаарай шалгуур үзүүлэлтийн нийлбэр жин 100%-иас хэтэрч байна."
                }

            if total_weight < 100:
                return {
                    "retType": 1,
                    "retMsg": "Уучлаарай шалгуур үзүүлэлтийн нийлбэр жин 100%-иас бага байна."
                }

            
            if param.get("status") == 1:

                tender = Tbltender.objects.filter(
                    tenderid=param.get("tenderid")
                ).first()

                if tender and tender.publishdate:
                    if tender.publishdate.date() > timezone.now().date():
                        return {
                            "retType": -1,
                            "retMsg": "Уучлаарай тендер нийтлэх хугацаа болоогүй байна."
                        }

            
            Tblinvitation.objects.filter(
                invitationid=invitationid
            ).update(
                acceptdate=datetime.strptime(param.get("acceptdate"), "%Y.%m.%d %H:%M:%S"),
                opendate=datetime.strptime(param.get("opendate"), "%Y.%m.%d %H:%M:%S"),
                description=param.get("description"),
                status=param.get("status")
            )

            
            Tbltender.objects.filter(
                tenderid=param.get("tenderid")
            ).update(
                publishdate=datetime.strptime(param.get("publishdate"), "%Y.%m.%d")
            )

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    @staticmethod
    def send_new_tender_notification(param):

        result = {"retType": 0, "retMsg": ""}

        try:

            vendors = Tblvendor.objects.exclude(vendoremail__isnull=True)

            email_list = []

            for vendor in vendors:
                email = vendor.vendoremail
                if email and is_valid(email):
                    email_list.append(email)

            if email_list:

                subject = "Шинэ тендер зарлагдсан тухай"

                body = f"""
                Сайн байна уу.<br/>
                Танд энэ өдрийн мэнд хүргэе!<br/><br/>

                Манай <b>tender.mak.mn</b> вэб дээр 
                <b>{param.get('description')}</b> гэсэн шинэ тендер зарлагдлаа.<br/><br/>

                Тендерийн материал хүлээн авах эцсийн хугацаа:
                <b>{param.get('acceptdate')}</b><br/><br/>

                Дэлгэрэнгүй мэдээллийг 
                <b>https://tender.mak.mn</b> вэб хуудаснаас авна уу.<br/><br/>

                Хамтран ажилласан танд баярлалаа!<br/><br/>

                Хүндэтгэсэн,<br/>
                MAK Procurement Team
                """

                send_mail(
                    subject,
                    "",
                    settings.DEFAULT_FROM_EMAIL,
                    email_list,
                    html_message=body
                )

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    @staticmethod
    def send_new_joinwork_notification(param):

        result = {"retType": 0, "retMsg": ""}

        try:
            vendors = Tblvendor.objects.exclude(vendoremail__isnull=True)

            email_list = []

            for vendor in vendors:
                email = vendor.vendoremail
                if email and is_valid(email):
                    email_list.append(email)

            if email_list:

                subject = "Шинэ ХАМТРАН АЖИЛЛАХ УРИЛГА зарлагдсан тухай"

                body = f"""
                Сайн байна уу.<br/>
                Танд энэ өдрийн мэнд хүргэе!<br/><br/>

                Манай <b>tender.mak.mn</b> вэб дээр 
                <b>{param.get('joinworkname')}</b> гэсэн 
                Хамтран ажиллах Урилга зарлагдлаа.<br/><br/>

                Хамтран ажиллах санал хүлээн авах эцсийн хугацаа:
                <b>{param.get('enddate')}</b><br/><br/>

                Дэлгэрэнгүй мэдээллийг 
                <b>https://tender.mak.mn</b> вэб хуудаснаас авна уу.<br/><br/>

                Хамтран ажилласан танд баярлалаа!<br/><br/>

                Хүндэтгэсэн,<br/>
                MAK Procurement Team
                """

                send_mail(
                    subject,
                    "",
                    settings.DEFAULT_FROM_EMAIL,
                    email_list,
                    html_message=body
                )

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    @staticmethod
    @transaction.atomic
    def delay_invitation(param):

        result = {"retType": 0, "retMsg": ""}

        try:

            invitation = Tblinvitation.objects.get(
                invitationid=param.get("invitationid")
            )

            # -------------------------
            # Send Email Notification
            # -------------------------

            email_to = invitation.createdby

            subject = "Тендерийн хугацааг өөрчилсөн тухай"

            acceptdate = datetime.strptime(
                param.get("acceptdate"), "%Y-%m-%d %H:%M:%S"
            )

            body = f"""
            Сайн байна уу.<br/><br/>

            Таны үүсгэсэн <b>'{param.get('tendername')}'</b> тендерийг 
            '{param.get('delayedby')}' хэрэглэгч 
            хүлээн авах эцсийн хугацааг 
            '{acceptdate.strftime("%Y.%m.%d %H:%M:%S")}'
            болгож хойшлуулав.
            """

            send_mail(
                subject,
                "",
                settings.DEFAULT_FROM_EMAIL,
                [email_to],
                html_message=body
            )

            # -------------------------
            # Save Delay History
            # -------------------------

            Tbltenderdelay.objects.create(
                delayedby=param.get("delayedby"),
                delayednote=param.get("description"),
                acceptdate=invitation.acceptdate,
                opendate=invitation.opendate,
                invitationid=invitation
            )

            # -------------------------
            # Update Invitation
            # -------------------------

            invitation.acceptdate = param.get("acceptdate")
            invitation.opendate = param.get("opendate")
            invitation.delaynote = param.get("description")
            invitation.delayedby = param.get("delayedby")
            invitation.status = param.get("status")

            invitation.save()

            # -------------------------
            # Delete logs
            # -------------------------

            Tbltenderopen.objects.filter(
                invitationid=invitation.invitationid
            ).delete()

            Tblinvevaluate.objects.filter(
                invitationid=invitation.invitationid
            ).delete()

            # -------------------------
            # Reset vendor invitations
            # -------------------------

            Tblinvitationofvendor.objects.filter(
                invitationid=invitation.invitationid
            ).update(
                note=None,
                status=2
            )

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result

    def insert_invitation_of_tender(param):
        result = {"retType": 0, "retMsg": "", "retData": None}

        try:
            # Step 1: Check if vendor has uploaded any documents for this invitation
            has_docs = Tbltenderjoindoc.objects.filter(
                invitationid=param.get("invitationid"),    
                vendorid=param.get("vendorid")
            ).exists()

            if not has_docs:
                result["retType"] = -1
                result["retMsg"] = "Уучлаарай та баримт бичиг оруулаагүй байна."
                return result

            # Step 2: Check if invitation-of-vendor already exists
            invitation_vendor = Tblinvitationofvendor.objects.filter(
                invitation_id=param.get("invitationid"),
                vendor_id=param.get("vendorid")
            ).first()

            if invitation_vendor:
                # Update status to 2
                invitation_vendor.status = 2
                invitation_vendor.save()
            else:
                # Insert new record
                Tblinvitationofvendor.objects.create(
                    tenderid=param.get("tenderid"),
                    invitation_id=param.get("invitationid"),
                    vendor_id=param.get("vendorid"),
                    status=2,
                    created=timezone.now(),
                    createdby=param.get("createdby")
                )

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def evaluate_invitation_of_vendor(param):
        result = {"retType": 0, "retMsg": ""}

        try:
            if len(param.get("param", [])) > 0:
            
                with transaction.atomic():
                    first_entry = param["param"][0]

                    Tblinvevaluate.objects.filter(
                        invitationid=first_entry["invitationid"],
                        vendorid=first_entry["vendorid"],
                        empid=param["empid"]
                    ).delete()

                    new_entries = []
                    now = timezone.now()
                    for r in param["param"]:
                        new_entries.append(
                            Tblinvevaluate(
                                invitationid=r["invitationid"],
                                vendorid=r["vendorid"],
                                criteriaid=r["criteriaid"],
                                result=r["result"],
                                createdby=param["createdby"],
                                empid=param["empid"],
                                created=now
                            )
                        )

                    Tblinvevaluate.objects.bulk_create(new_entries)

        except Exception as ex:
        
            print(f"Error: {ex}")
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def final_evaluation_invitation_of_vendor(param):
        result = {"retType": 0, "retMsg": ""}

        try:
            with connection.cursor() as cursor:

                sql = """
                UPDATE TBLINVITATIONOFVENDOR
                SET note = %s,
                    status = %s,
                    updated = %s
                WHERE vendorid = %s AND invitationid = %s
                """
                now_str = datetime.now().strftime("%Y.%m.%d %H:%M:%S")

                cursor.execute(sql, [
                    param.get("note", ""),
                    param["status"],
                    now_str,
                    param["vendorid"],
                    param["invitationid"]
                ])

        except Exception as ex:

            print(f"Error: {ex}")
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def evaluate_invitation_first_round(param):
        result = {"retType": 0, "retMsg": ""}

        try:
            with connection.cursor() as cursor:
                # Check if record exists
                cursor.execute(
                    """
                    SELECT COUNT(*) FROM TBLINVITATIONVENDOR_SELECTION
                    WHERE invitationid = %s AND vendorid = %s AND empid = %s
                    """,
                    [param["invitationid"], param["vendorid"], param["empid"]]
                )
                count = cursor.fetchone()[0]

                now_str = datetime.now().strftime("%Y.%m.%d %H:%M:%S")

                if count > 0:
                    # Update existing record
                    sql = """
                    UPDATE TBLINVITATIONVENDOR_SELECTION
                    SET first_round_comment = %s,
                        first_round_status = %s,
                        created = TO_TIMESTAMP(%s, 'YYYY.MM.DD HH24:MI:SS')
                    WHERE invitationid = %s AND vendorid = %s AND empid = %s
                    """
                    params = [
                        param["first_round_comment"],
                        param["first_round_status"],
                        now_str,
                        param["invitationid"],
                        param["vendorid"],
                        param["empid"]
                    ]
                else:
                    # Insert new record
                    sql = """
                    INSERT INTO TBLINVITATIONVENDOR_SELECTION
                    (invitationid, vendorid, empid, first_round_status, first_round_comment, createdby, created)
                    VALUES (%s, %s, %s, %s, %s, %s, TO_TIMESTAMP(%s, 'YYYY.MM.DD HH24:MI:SS'))
                    """
                    params = [
                        param["invitationid"],
                        param["vendorid"],
                        param["empid"],
                        param["first_round_status"],
                        param["first_round_comment"],
                        param["createdby"],
                        now_str
                    ]

                cursor.execute(sql, params)

        except Exception as ex:
            print(f"Error: {ex}")
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    @staticmethod
    @transaction.atomic
    def open_invitation_of_vendor(param):

        result = {"retType": 0, "retMsg": ""}

        try:

            invitationid = param.get("invitationid")

            Tblinvitationofvendor.objects.filter(
                invitation_id=invitationid
            ).update(status=3)

            Tblinvitation.objects.filter(
                invitationid=invitationid
            ).update(
                status=3,
                openby=param.get("openby"),
                note=param.get("note")
            )

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    @staticmethod
    @transaction.atomic
    def finish_invitation(invitationid):

        result = {"retType": 0, "retMsg": ""}

        try:

            # update invitation status
            Tblinvitation.objects.filter(
                invitationid=invitationid
            ).update(status=7)

            participants = Tblinvitationofvendor.objects.select_related(
                "invitation",
                "vendor",
                "invitation__tender"
            ).filter(
                invitation_id=invitationid
            )

            for p in participants:

                email_to = p.vendor.vendoremail
                vendorname = p.vendor.vendorname
                tendercode = p.invitation.tender.tendercode
                tendername = p.invitation.tender.tendername

                if str(p.status) == "5":
                    status_text = "Шалгарсан"
                    thank_you = "Танд баяр хүргэе!"
                else:
                    status_text = "Шалгараагүй"
                    thank_you = ""

                subject = "Тендер шалгаруулалтын хариу"

                body = f"""
                Сайн байна уу.<br/><br/>
                {vendorname} Танд <b>tender.mak.mn</b>-ээс 
                <b>{tendercode}</b> кодтой 
                <b>{tendername}</b> тендерийн хариуг илгээж байна.<br/><br/>

                Үр дүн: {status_text}<br/>
                Тайлбар: {p.note}<br/><br/>

                {thank_you}<br/><br/>

                Хамтран ажилласан танд баярлалаа!<br/><br/>

                Хүндэтгэсэн,<br/>
                MAK Procurement Team
                """

                send_mail(
                    subject,
                    "",
                    "noreply@mak.mn",
                    [email_to],
                    html_message=body,
                    fail_silently=True
                )

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    @staticmethod
    def reject_invitation(param):

        result = {"retType": 0, "retMsg": ""}

        try:

            Tblinvitation.objects.filter(
                invitation_id=param["invitationid"]
            ).update(
                status=8,
                rejectby=param["rejectby"],
                rejectnote=param["rejectnote"]
            )

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    @staticmethod
    def publish_request_inv(param):

        result = {"retType": 0, "retMsg": ""}

        try:

            emails = Tblemailcc.objects.values_list("email", flat=True)

            email_to = list(emails)

            subject = "Тендер нийтлэх хүсэлт"

            body = f"""
            Сайн байна уу.<br/><br/>
            Танд <b>procurement.mak.mn</b> -ээс
            <b>'{param["tendername"]}'</b> тендерийг нийтлэх хүсэлт ирсэн байна.
            """

            send_mail(
                subject,
                "",
                "noreply@mak.mn",
                email_to,
                html_message=body,
                fail_silently=True
            )

            Tblinvitation.objects.filter(
                invitationid=param["invitationid"]
            ).update(
                status=6
            )

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    @staticmethod
    def re_publish_request_inv(param):

        result = {"retType": 0, "retMsg": ""}

        try:

            emails = Tblemailcc.objects.values_list("email", flat=True)

            email_to = list(emails)

            if email_to:

                subject = "Тендер дахин зарлах хүсэлт"

                body = f"""
                Сайн байна уу.<br/><br/>
                Танд <b>'{param["tendername"]}'</b> тендерийг дахин зарлах хүсэлт ирсэн байна.
                """

                send_mail(
                    subject,
                    "",
                    "noreply@mak.mn",
                    email_to,
                    html_message=body,
                    fail_silently=True
                )

                Tblinvitation.objects.filter(
                    invitationid=param["invitationid"]
                ).update(
                    status=9
                )

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    

    @staticmethod
    @transaction.atomic
    def re_publish_invitation(param):

        result = {"retType": 0, "retMsg": "", "retData": None}

        try:
            if isinstance(param, list):
                param = param[0]

            old_invitation_id = param["invitationid"]

            # update old invitation
            Tblinvitation.objects.filter(
                invitationid=old_invitation_id
            ).update(status=10)

            # create new invitation
            header_result = TenderService.save_invitation_header(
                param["tenderid"],
                param["createdby"],
                0
            )

            if header_result["retType"] != 0:
                return header_result

            new_invitation_id = header_result["retData"][0][0]
            # --------------------------
            # Copy evaluation members
            # --------------------------

            evaluations = Tblevaluation.objects.filter(
                invitationid=old_invitation_id
            )

            for e in evaluations:
                Tblevaluation.objects.create(
                    invitationid=new_invitation_id,
                    empid=e.empid,
                    empname=e.empname,
                    positionname=e.positionname,
                    roleid=e.roleid,
                    createdby=param["createdby"],
                    email=e.email,
                    image=e.image
                )

            # --------------------------
            # Copy tender docs
            # --------------------------

            docs = Tbltenderdoc.objects.filter(
                invitationid=old_invitation_id
            )

            new_docs = []

            for d in docs:
                new_doc = Tbltenderdoc.objects.create(
                    documentcode=d.documentcode,
                    documentname=d.documentname,
                    doctypeid=d.doctypeid,
                    batchid=d.batchid,
                    fileid=d.fileid,
                    tenderid=d.tenderid,
                    invitationid=new_invitation_id,
                    createdby=param["createdby"]
                )

                new_docs.append(new_doc)

            # --------------------------
            # Copy files
            # --------------------------

            for d, new_doc in zip(docs, new_docs):

                files = Tblfiles.objects.filter(sourceid=d.docid)

                for f in files:
                    Tblfiles.objects.create(
                        filename=f.filename,
                        filetype=f.filetype,
                        filepath=f.filepath,
                        sourceid=new_doc.docid,
                        sourcetype=f.sourcetype
                    )

            # --------------------------
            # Copy requirements
            # --------------------------

            requires = Tblrequire.objects.filter(
                invitationid=old_invitation_id
            )

            for r in requires:
                Tblrequire.objects.create(
                    invitationid=new_invitation_id,
                    requirename=r.requirename,
                    requiretypeid=r.requiretypeid,
                    visible=r.visible
                )

            # --------------------------
            # Copy criterias
            # --------------------------

            criterias = Tblcriteria.objects.filter(
                invitationid=old_invitation_id
            )

            for c in criterias:
                Tblcriteria.objects.create(
                    invitationid=new_invitation_id,
                    criteriatypeid=c.criteriatypeid,
                    criterianame=c.criterianame,
                    weight=c.weight,
                    visible=c.visible
                )

            # --------------------------
            # Copy notes
            # --------------------------

            notes = Tblnotes.objects.filter(
                invitationid=old_invitation_id
            )

            for n in notes:
                Tblnotes.objects.create(
                    invitationid=new_invitation_id,
                    address=n.address,
                    phone=n.phone,
                    email=n.email,
                    electron=n.electron,
                    post=n.post
                )

        except Exception as ex:

            result["retType"] = 1
            result["retMsg"] = traceback.format_exc()

        return result
    
    def update_invitation_of_tender(invitationid, vendorid):
        result = {"retType": 0, "retMsg": "", "retData": None}

        try:
            updated = Tblinvitationofvendor.objects.filter(
                invitation_id=invitationid,
                vendor_id=vendorid
            ).update(status=0)

            result["retData"] = updated

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitation_of_vendor_list(invitationid, empid):

        result = {"retType": 0, "retMsg": "", "retData": []}

        try:
            with connection.cursor() as cursor:

                cursor.execute("""
                    select iov.id,
                        iov.vendorid,
                        v.vendorname,
                        q.totalamount,
                        count(tjd.joindocid) as countdoc,
                        ev.totalpoint,
                        iov.invitationid,
                        iov.status,
                        iov.note,
                        iov.approvedamount,
                        vs.first_round_status,
                        vs.first_round_comment,
                        iov.won_first_round,
                        iov.won_second_round,
                        iov.won_third_round,
                        vs.third_round_status,
                        vs.third_round_comment
                    from TBLINVITATIONOFVENDOR iov
                    inner join TBLVENDOR v
                        on v.vendorid = iov.vendorid
                    inner join TBLINVITATION i
                        on i.invitationid = iov.invitationid

                    left join (
                        select sum(COALESCE(qouteamount, 0)) totalamount,
                            vendorid,
                            invitationid
                        from TBLQOUTE
                        group by vendorid, invitationid
                    ) q
                        on q.vendorid = iov.vendorid
                        and q.invitationid = iov.invitationid

                    left join TBLTENDERJOINDOC tjd
                        on tjd.vendorid = iov.vendorid
                        and tjd.invitationid = iov.invitationid

                    left join (
                        select sum(COALESCE(result, 0)) totalpoint,
                            vendorid,
                            invitationid,
                            empid
                        from TBLINVEVALUATE
                        where empid = %s
                        group by vendorid, invitationid, empid
                    ) ev
                        on ev.invitationid = iov.invitationid
                        and iov.vendorid = ev.vendorid

                    left join (
                        select first_round_status,
                            first_round_comment,
                            third_round_status,
                            third_round_comment,
                            vendorid,
                            invitationid
                        from TBLINVITATIONVENDOR_SELECTION
                        where empid = %s
                        group by vendorid,
                                invitationid,
                                first_round_status,
                                first_round_comment,
                                third_round_status,
                                third_round_comment
                    ) vs
                        on vs.invitationid = iov.invitationid
                        and iov.vendorid = vs.vendorid

                    where iov.invitationid = %s

                    group by
                        iov.id,
                        iov.invitationid,
                        iov.vendorid,
                        v.vendorname,
                        iov.status,
                        iov.note,
                        q.totalamount,
                        ev.totalpoint,
                        iov.approvedamount,
                        vs.first_round_status,
                        vs.first_round_comment,
                        iov.won_first_round,
                        iov.won_second_round,
                        iov.won_third_round,
                        vs.third_round_status,
                        vs.third_round_comment
                """, [empid, empid, invitationid])

                columns = [col[0] for col in cursor.description]

                result["retData"] = [
                    dict(zip(columns, row))
                    for row in cursor.fetchall()
                ]

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitations_vendor_list_all(invitationid):

        result = {"retType": 0, "retMsg": "", "retData": []}

        try:
            with connection.cursor() as cursor:

                cursor.execute("""
                    SELECT 
                        iov.id,
                        iov.vendorid,
                        v.vendorname,
                        q.totalamount,
                        iov.invitationid,
                        iov.won_first_round,
                        iov.won_second_round
                    FROM TBLINVITATIONOFVENDOR iov

                    INNER JOIN TBLVENDOR v
                        ON v.vendorid = iov.vendorid

                    LEFT JOIN (
                        SELECT 
                            SUM(COALESCE(qouteamount,0)) AS totalamount,
                            vendorid,
                            invitationid
                        FROM TBLQOUTE
                        GROUP BY vendorid, invitationid
                    ) q
                        ON q.vendorid = iov.vendorid
                        AND q.invitationid = iov.invitationid

                    WHERE iov.invitationid = %s
                """, [invitationid])

                columns = [col[0] for col in cursor.description]

                result["retData"] = [
                    dict(zip(columns, row))
                    for row in cursor.fetchall()
                ]

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitations_vendor_list_for_next_round(invitationid, stage):

        result = {"retType": 0, "retMsg": "", "retData": []}

        try:
            condition = ""

            if int(stage) == 2:
                condition = "AND iov.won_first_round = 1"
            elif int(stage) == 3:
                condition = "AND iov.won_second_round = 1"

            query = f"""
                SELECT 
                    iov.id,
                    iov.vendorid,
                    v.vendorname,
                    q.totalamount,
                    iov.invitationid,
                    iov.won_first_round,
                    iov.won_second_round
                FROM TBLINVITATIONOFVENDOR iov

                INNER JOIN TBLVENDOR v
                    ON v.vendorid = iov.vendorid

                LEFT JOIN (
                    SELECT 
                        SUM(COALESCE(qouteamount,0)) totalamount,
                        vendorid,
                        invitationid
                    FROM TBLQOUTE
                    GROUP BY vendorid, invitationid
                ) q
                    ON q.vendorid = iov.vendorid
                    AND q.invitationid = iov.invitationid

                WHERE iov.invitationid = %s
                {condition}
            """

            with connection.cursor() as cursor:
                cursor.execute(query, [invitationid])

                columns = [col[0] for col in cursor.description]

                result["retData"] = [
                    dict(zip(columns, row))
                    for row in cursor.fetchall()
                ]

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitation_of_vendor_round_evaluation(invitationid, vendorid, empid):
        result = {
            "retType": 0,
            "retMsg": "",
            "retData": []
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        TBLINVITATIONOFVENDOR.id,
                        TBLINVITATIONOFVENDOR.vendorid,
                        vendorname,
                        first_round_status,
                        first_round_comment,
                        third_round_status,
                        third_round_comment,
                        TBLINVITATIONVENDOR_SELECTION.created,
                        TBLINVITATIONVENDOR_SELECTION.createdby,
                        TBLINVITATIONVENDOR_SELECTION.empid,
                        TBLINVITATIONOFVENDOR.invitationid
                    FROM TBLINVITATIONOFVENDOR

                    INNER JOIN TBLVENDOR 
                        ON TBLVENDOR.vendorid = TBLINVITATIONOFVENDOR.vendorid

                    INNER JOIN TBLINVITATIONVENDOR_SELECTION 
                        ON TBLINVITATIONVENDOR_SELECTION.invitationid = TBLINVITATIONOFVENDOR.invitationid                    

                    LEFT JOIN (
                        SELECT 
                            SUM(COALESCE(qouteamount,0)) totalamount,
                            vendorid,
                            invitationid
                        FROM TBLQOUTE
                        GROUP BY vendorid, invitationid
                    ) qoute
                        ON qoute.vendorid = TBLINVITATIONOFVENDOR.vendorid 
                        AND qoute.invitationid = TBLINVITATIONOFVENDOR.invitationid

                    WHERE 
                        TBLINVITATIONVENDOR_SELECTION.invitationid = %s
                        AND TBLINVITATIONVENDOR_SELECTION.empid = %s
                        AND TBLINVITATIONVENDOR_SELECTION.vendorid = %s
                """, [invitationid, empid, vendorid])

                columns = [col[0] for col in cursor.description]

                for row in cursor.fetchall():
                    result["retData"].append(dict(zip(columns, row)))

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitations_vendor_evaluation_list(invitationid):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": []
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT *
                    FROM TBLINVEVALUATE
                    WHERE invitationid = %s
                """, [invitationid])

                columns = [col[0] for col in cursor.description]

                for row in cursor.fetchall():
                    result["retData"].append(dict(zip(columns, row)))

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitations_vendor_first_evaluation_list(invitationid):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": []
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT *
                    FROM TBLINVITATIONVENDOR_SELECTION
                    WHERE invitationid = %s
                """, [invitationid])

                columns = [col[0] for col in cursor.description]

                for row in cursor.fetchall():
                    result["retData"].append(dict(zip(columns, row)))

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitation_of_vendor_list_by_id(invitationid, vendorid, empid):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": []
        }

        try:
            with connection.cursor() as cursor:

                cursor.execute("""
                    SELECT 
                        TBLCRITERIA.criteriaid,
                        TBLCRITERIA.weight,
                        TBLCRITERIA.INVITATIONID,
                        TBLCRITERIA.criterianame,
                        TBLCRITERIATYPE.criteriatypename,
                        TBLINVITATIONOFVENDOR.vendorid,
                        result,
                        TBLINVITATIONOFVENDOR.note,
                        TBLINVITATIONOFVENDOR.status,
                        TBLINVITATION.status AS tenderstatus,
                        TBLINVEVALUATE.createdby,
                        TBLINVEVALUATE.created,
                        approvedamount,
                        savedamount
                    FROM TBLINVITATIONOFVENDOR
                    INNER JOIN TBLINVITATION 
                        ON TBLINVITATIONOFVENDOR.invitationid = TBLINVITATION.invitationid
                    INNER JOIN TBLCRITERIA 
                        ON TBLINVITATIONOFVENDOR.invitationid = TBLCRITERIA.INVITATIONID
                    INNER JOIN TBLCRITERIATYPE 
                        ON TBLCRITERIA.criteriatypeid = TBLCRITERIATYPE.criteriatypeid
                    LEFT JOIN TBLINVEVALUATE 
                        ON TBLINVEVALUATE.criteriaid = TBLCRITERIA.criteriaid
                        AND TBLINVEVALUATE.invitationid = TBLCRITERIA.invitationid
                        AND TBLINVEVALUATE.vendorid = %s
                    WHERE 
                        TBLINVITATIONOFVENDOR.invitationid = %s
                        AND TBLINVITATIONOFVENDOR.vendorid = %s
                        AND TBLINVEVALUATE.empid = %s
                """, [vendorid, invitationid, vendorid, empid])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                for row in rows:
                    result["retData"].append(dict(zip(columns, row)))

                # If first query returned no rows, run second query
                if len(result["retData"]) == 0:

                    cursor.execute("""
                        SELECT DISTINCT
                            TBLCRITERIA.criteriaid,
                            TBLCRITERIA.weight,
                            TBLCRITERIA.INVITATIONID,
                            TBLCRITERIA.criterianame,
                            TBLCRITERIATYPE.criteriatypename,
                            TBLINVITATION.status AS tenderstatus
                        FROM TBLCRITERIA
                        INNER JOIN TBLINVITATION 
                            ON TBLCRITERIA.invitationid = TBLINVITATION.invitationid
                        INNER JOIN TBLCRITERIATYPE 
                            ON TBLCRITERIA.criteriatypeid = TBLCRITERIATYPE.criteriatypeid
                        WHERE TBLINVITATION.invitationid = %s
                    """, [invitationid])

                    columns = [col[0] for col in cursor.description]

                    for row in cursor.fetchall():
                        result["retData"].append(dict(zip(columns, row)))

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitation_of_vendors_final_result(invitationid, vendorid):
        query = """
            SELECT *
            FROM TBLINVITATIONOFVENDOR
            WHERE invitationid = %s AND vendorid = %s
        """
        return run_service(query, [invitationid, vendorid])
    
    def save_invitation_vendor_round_selection_result(param_list):
       
        result = {
            "retType": 0,
            "retMsg": "",
            "retData": []
        }

        try:
            stagePrm = 0
            now_str = datetime.now().strftime("%Y.%m.%d %H:%M:%S")

            with connection.cursor() as cursor:

                # Stage 1 updates
                stage1_rows = [
                    (
                        r.get("won_first_round", 0),
                        r.get("createdby_first_round", ""),
                        now_str,
                        r["invitationid"],
                        r["vendorid"]
                    )
                    for r in param_list if r["stage"] == 1
                ]
                if stage1_rows:
                    cursor.executemany("""
                        UPDATE TBLINVITATIONOFVENDOR
                        SET won_first_round=%s,
                            createdby_first_round=%s,
                            created_first_round=%s
                        WHERE invitationid=%s AND vendorid=%s
                    """, stage1_rows)
                    stagePrm = 1

                # Stage 2 updates
                stage2_rows = [
                    (
                        r.get("won_second_round", 0),
                        r.get("createdby_second_round", ""),
                        now_str,
                        r["invitationid"],
                        r["vendorid"]
                    )
                    for r in param_list if r["stage"] == 2
                ]
                if stage2_rows:
                    cursor.executemany("""
                        UPDATE TBLINVITATIONOFVENDOR
                        SET won_second_round=%s,
                            createdby_second_round=%s,
                            created_second_round=%s
                        WHERE invitationid=%s AND vendorid=%s
                    """, stage2_rows)
                    stagePrm = 2

                # Update TBLINVITATION selection complete flag
                if stagePrm == 1:
                    invitation_id = next((r["invitationid"] for r in param_list if r["stage"] == 1), None)
                    if invitation_id:
                        cursor.execute(
                            "UPDATE TBLINVITATION SET firstSelectionComplete = 1 WHERE invitationid = %s",
                            [invitation_id]
                        )
                elif stagePrm == 2:
                    invitation_id = next((r["invitationid"] for r in param_list if r["stage"] == 2), None)
                    if invitation_id:
                        cursor.execute(
                            "UPDATE TBLINVITATION SET secondSelectionComplete = 1 WHERE invitationid = %s",
                            [invitation_id]
                        )

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def delete_invitation_of_vendor(vendor_id):
        query = "DELETE FROM TBLINVITATIONOFVENDOR WHERE id = %s"
        return run_service(query, [vendor_id])
  
    def get_invitation_list(user):
        result = {
            "retType": 0,
            "retMsg": "",
            "retData": []
        }

        try:
            id_list = get_users_invitation_ids(user)

            id_list = str(id_list or "")

            base_query = """
                SELECT 
                    TBLINVITATION.invitationid,
                    TBLINVITATION.invitationcode,
                    TBLTENDER.tenderid,
                    TBLTENDER.tendername,
                    TBLTENDER.tendercode,
                    departmentname,
                    tendertypename,
                    purchasetypename,
                    TO_CHAR(startdate,'YYYY.MM.DD') startdate,
                    TO_CHAR(enddate,'YYYY.MM.DD') enddate,
                    TO_CHAR(acceptdate,'YYYY.MM.DD HH24:MI') acceptdate,
                    TO_CHAR(opendate,'YYYY.MM.DD HH24:MI') opendate,
                    TO_CHAR(publishdate,'YYYY.MM.DD') publishdate,
                    CONCAT(TO_CHAR(TBLTENDER.PUBLISHDATE,'YYYY.MM.DD'), ' - ', TO_CHAR(opendate,'YYYY.MM.DD')) dateinterval,
                    budget,
                    0 as recieved,
                    comment.count as comment,
                    acceptdate::date - CURRENT_DATE AS balanceday,
                    TBLINVITATIONSTATUS.name status,
                    COALESCE(TBLINVITATION.status, 0) AS status_id,
                    CASE WHEN EXTRACT(YEAR FROM TBLINVITATION.acceptdate) BETWEEN 1 AND 9999 THEN TBLINVITATION.acceptdate END AS acceptdate_iso,
                    CASE WHEN EXTRACT(YEAR FROM TBLINVITATION.opendate) BETWEEN 1 AND 9999 THEN TBLINVITATION.opendate END AS opendate_iso
                FROM TBLINVITATION
                LEFT JOIN TBLTENDER ON TBLTENDER.tenderid = TBLINVITATION.tenderid
                LEFT JOIN TBLDEPARTMENT ON TBLDEPARTMENT.departmentid = TBLTENDER.departmentid
                LEFT JOIN TBLTENDERTYPE ON TBLTENDERTYPE.tendertypeid = TBLTENDER.tendertypeid
                LEFT JOIN TBLPURCHASETYPE ON TBLPURCHASETYPE.purchasetypeid = TBLTENDER.purchasetypeid
                LEFT JOIN TBLINVITATIONSTATUS ON TBLINVITATIONSTATUS.status = COALESCE(TBLINVITATION.status, 0)
                LEFT JOIN (
                    SELECT COUNT(*) count, invitationid
                    FROM TBLCOMMENT
                    WHERE seen = 0 AND vendorid > 0
                    GROUP BY invitationid
                ) comment ON comment.invitationid = TBLINVITATION.invitationid
                WHERE COALESCE(TBLINVITATION.status, 0) IN (0,6)
            """

            params = []

            if id_list != "All" and id_list:
                # Convert CSV string to list of ints safely
                ids = [int(i) for i in id_list.split(",") if i.strip().isdigit()]
                if ids:  # Only add filter if we have valid IDs
                    placeholders = ",".join(["%s"] * len(ids))
                    base_query += f" AND TBLINVITATION.INVITATIONID IN ({placeholders})"
                    params = ids

            result = run_service(base_query, params)

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitation_list_open(user):
  
        result = {
            "retType": 0,
            "retMsg": "",
            "retData": []
        }

        try:
            id_list = get_users_invitation_ids(user)
            id_list = str(id_list or "")

            base_query = """
                SELECT 
                    TBLINVITATION.invitationid,
                    TBLINVITATION.invitationcode,
                    TBLTENDER.tenderid,
                    TBLTENDER.tendername,
                    TBLTENDER.tendercode,
                    departmentname,
                    tendertypename,
                    purchasetypename,
                    TO_CHAR(startdate, 'YYYY.MM.DD') startdate,
                    TO_CHAR(enddate, 'YYYY.MM.DD') enddate,
                    TO_CHAR(acceptdate, 'YYYY.MM.DD HH24:MI') acceptdate,
                    TO_CHAR(opendate, 'YYYY.MM.DD HH24:MI') opendate,
                    TO_CHAR(publishdate, 'YYYY.MM.DD HH24:MI') publishdate,
                    CONCAT(TO_CHAR(TBLTENDER.PUBLISHDATE, 'YYYY.MM.DD'),' - ',TO_CHAR(opendate,'YYYY.MM.DD')) AS dateinterval,
                    budget,
                    invitationofvendor.recieved,
                    comment.count as comment,
                    acceptdate::date - CURRENT_DATE AS balanceday,
                    CASE 
                        WHEN acceptdate >= CURRENT_TIMESTAMP 
                        THEN TBLINVITATIONSTATUS.name 
                        ELSE 'Хугацаа дууссан'
                    END status,
                    TBLINVITATION.status AS status_id,
                    CASE WHEN EXTRACT(YEAR FROM TBLINVITATION.acceptdate) BETWEEN 1 AND 9999 THEN TBLINVITATION.acceptdate END AS acceptdate_iso,
                    CASE WHEN EXTRACT(YEAR FROM TBLINVITATION.opendate) BETWEEN 1 AND 9999 THEN TBLINVITATION.opendate END AS opendate_iso
                FROM TBLINVITATION
                INNER JOIN TBLTENDER ON TBLTENDER.tenderid = TBLINVITATION.tenderid
                LEFT JOIN TBLDEPARTMENT ON TBLDEPARTMENT.departmentid = TBLTENDER.departmentid
                LEFT JOIN TBLTENDERTYPE ON TBLTENDERTYPE.tendertypeid = TBLTENDER.tendertypeid
                LEFT JOIN TBLPURCHASETYPE ON TBLPURCHASETYPE.purchasetypeid = TBLTENDER.purchasetypeid
                INNER JOIN TBLINVITATIONSTATUS ON TBLINVITATIONSTATUS.status = TBLINVITATION.status
                LEFT JOIN (
                    SELECT COUNT(invitationid) recieved, invitationid
                    FROM TBLINVITATIONOFVENDOR
                    GROUP BY invitationid
                ) invitationofvendor ON invitationofvendor.invitationid = TBLINVITATION.invitationid
                LEFT JOIN (
                    SELECT COUNT(*) count, invitationid
                    FROM TBLCOMMENT
                    WHERE seen = 0 AND vendorid > 0
                    GROUP BY invitationid
                ) comment ON comment.invitationid = TBLINVITATION.invitationid
                WHERE TBLINVITATION.status IN (1,3)
            """

            params = []

            if id_list != "All" and id_list:
                ids = [int(i) for i in id_list.split(",") if i.strip().isdigit()]
                if ids:
                    placeholders = ",".join(["%s"] * len(ids))
                    base_query += f" AND TBLINVITATION.INVITATIONID IN ({placeholders})"
                    params = ids

            base_query += " ORDER BY opendate DESC"

            result = run_service(base_query, params)

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitation_list_result(user):
   
        result = {
            "retType": 0,
            "retMsg": "",
            "retData": []
        }

        try:
          
            id_list = get_users_invitation_ids(user)
            id_list = str(id_list or "")

            base_query = """
                SELECT
                    TBLINVITATION.invitationid,
                    TBLINVITATION.invitationcode,
                    TBLTENDER.tenderid,
                    TBLTENDER.tendername,
                    TBLTENDER.tendercode,
                    departmentname,
                    tendertypename,
                    purchasetypename,
                    TO_CHAR(startdate, 'YYYY.MM.DD') startdate,
                    TO_CHAR(enddate, 'YYYY.MM.DD') enddate,
                    TO_CHAR(acceptdate, 'YYYY.MM.DD HH24:MI') acceptdate,
                    TO_CHAR(opendate, 'YYYY.MM.DD HH24:MI') opendate,
                    TO_CHAR(publishdate, 'YYYY.MM.DD HH24:MI') publishdate,
                    CONCAT(TO_CHAR(TBLTENDER.PUBLISHDATE, 'YYYY.MM.DD'),' - ',TO_CHAR(opendate,'YYYY.MM.DD')) AS dateinterval,
                    budget,
                    invitationofvendor.recieved,
                    comment.count as comment,
                    acceptdate::date - CURRENT_DATE AS balanceday,
                    TBLINVITATIONSTATUS.name status,
                    COALESCE(vendor.count,0) isselect
                    , TBLINVITATION.status AS status_id,
                    CASE WHEN EXTRACT(YEAR FROM TBLINVITATION.acceptdate) BETWEEN 1 AND 9999 THEN TBLINVITATION.acceptdate END AS acceptdate_iso,
                    CASE WHEN EXTRACT(YEAR FROM TBLINVITATION.opendate) BETWEEN 1 AND 9999 THEN TBLINVITATION.opendate END AS opendate_iso
                FROM TBLINVITATION
                INNER JOIN TBLTENDER ON TBLTENDER.tenderid = TBLINVITATION.tenderid
                LEFT JOIN TBLDEPARTMENT ON TBLDEPARTMENT.departmentid = TBLTENDER.departmentid
                LEFT JOIN TBLTENDERTYPE ON TBLTENDERTYPE.tendertypeid = TBLTENDER.tendertypeid
                LEFT JOIN TBLPURCHASETYPE ON TBLPURCHASETYPE.purchasetypeid = TBLTENDER.purchasetypeid
                INNER JOIN TBLINVITATIONSTATUS ON TBLINVITATIONSTATUS.status = TBLINVITATION.status
                LEFT JOIN (
                    SELECT COUNT(invitationid) recieved, invitationid
                    FROM TBLINVITATIONOFVENDOR
                    GROUP BY invitationid
                ) invitationofvendor ON invitationofvendor.invitationid = TBLINVITATION.invitationid
                LEFT JOIN (
                    SELECT COUNT(*) count, invitationid
                    FROM TBLCOMMENT
                    WHERE seen = 0 AND vendorid > 0
                    GROUP BY invitationid
                ) comment ON comment.invitationid = TBLINVITATION.invitationid
                LEFT JOIN (
                    SELECT COUNT(*) count, invitationid
                    FROM TBLINVITATIONOFVENDOR
                    WHERE status = 5
                    GROUP BY invitationid
                ) vendor ON vendor.invitationid = TBLINVITATION.invitationid
                WHERE TBLINVITATION.status IN (7,8,9,10)
            """

            params = []

            if id_list != "All" and id_list:
                ids = [int(i) for i in id_list.split(",") if i.strip().isdigit()]
                if ids:
                    placeholders = ",".join(["%s"] * len(ids))
                    base_query += f" AND TBLINVITATION.INVITATIONID IN ({placeholders})"
                    params = ids

            base_query += " ORDER BY acceptdate DESC"

            result = run_service(base_query, params)

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitation_list_for_vendor(vendorid=None, matching_only=False):
    
        result = {
            "retType": 0,
            "retMsg": "",
            "retData": []
        }

        try:
            query = """
                SELECT
                    TBLINVITATION.invitationid,
                    TBLINVITATION.invitationcode,
                    TBLTENDER.tenderid,
                    TBLTENDER.tendername,
                    TBLTENDER.tendercode,
                    departmentname,
                    tendertypename,
                    purchasetypename,
                    TO_CHAR(startdate, 'YYYY.MM.DD') AS startdate,
                    TO_CHAR(enddate, 'YYYY.MM.DD') AS enddate,
                    TO_CHAR(publishdate, 'YYYY.MM.DD') AS publishdate,
                    TO_CHAR(acceptdate, 'YYYY.MM.DD HH24:MI') AS acceptdate,
                    TO_CHAR(opendate, 'YYYY.MM.DD HH24:MI') AS opendate,
                    0 AS recieved,
                    TBLINVITATION.status,
                    TBLINVITATIONSTATUS.name AS statusname,
                    comment.count AS comment,
                    acceptdate::date - CURRENT_DATE AS balanceday,
                    rejectnote,
                    COALESCE(activity_info.activityids, ARRAY[]::integer[]) activityids,
                    COALESCE(activity_info.activitynames, ARRAY[]::text[]) activitynames
                FROM TBLINVITATION
                INNER JOIN TBLTENDER
                    ON TBLTENDER.tenderid = TBLINVITATION.tenderid
                LEFT JOIN TBLDEPARTMENT
                    ON TBLDEPARTMENT.departmentid = TBLTENDER.departmentid
                LEFT JOIN TBLTENDERTYPE
                    ON TBLTENDERTYPE.tendertypeid = TBLTENDER.tendertypeid
                LEFT JOIN TBLPURCHASETYPE
                    ON TBLPURCHASETYPE.purchasetypeid = TBLTENDER.purchasetypeid
                LEFT JOIN (
                    SELECT COUNT(*) AS count, invitationid
                    FROM TBLCOMMENT
                    WHERE seen = 0
                    AND vendorid > 0
                    GROUP BY invitationid
                ) comment
                    ON comment.invitationid = TBLINVITATION.invitationid
                INNER JOIN TBLINVITATIONSTATUS
                    ON TBLINVITATIONSTATUS.status = TBLINVITATION.status
                LEFT JOIN LATERAL (
                    SELECT
                        ARRAY_AGG(activity.activityid ORDER BY activity.activityid) activityids,
                        ARRAY_AGG(activity.activity ORDER BY activity.activity) activitynames
                    FROM tender_activity_relation relation
                    INNER JOIN tblvendoractivity activity
                        ON activity.activityid=relation.activityid
                    WHERE relation.tenderid=TBLTENDER.tenderid
                ) activity_info ON TRUE
                WHERE TBLINVITATION.status = 1
                AND acceptdate >= CURRENT_TIMESTAMP
            """

            params = []
            if matching_only:
                if not vendorid:
                    return {
                        "retType": 1,
                        "retMsg": "Нийлүүлэгчийн мэдээлэл олдсонгүй.",
                        "retData": [],
                    }
                query += """
                    AND EXISTS (
                        SELECT 1
                        FROM tender_activity_relation tender_activity
                        INNER JOIN vendor_activity_relation vendor_activity
                            ON vendor_activity.activityid=tender_activity.activityid
                        WHERE tender_activity.tenderid=TBLTENDER.tenderid
                          AND vendor_activity.vendorid=%s
                    )
                """

            query += " ORDER BY TBLINVITATION.acceptdate ASC, TBLINVITATION.invitationid DESC"
            result = run_service(query, params + ([vendorid] if matching_only else []))

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def check_invitation_for_vendor(vendorid, invitationid):
        
        result = {"retType": 0, "retMsg": "", "retData": []}

        try:
            query = """
                SELECT COUNT(*) AS count
                FROM TBLINVITATIONOFVENDOR
                WHERE status > 0
                AND invitationid = %s
                AND vendorid = %s
            """
            params = [invitationid, vendorid]
            result = run_service(query, params)

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitation_list_participated(vendorid):
       
        result = {"retType": 0, "retMsg": "", "retData": []}

        try:
            query = """
                SELECT 
                    TBLINVITATIONOFVENDOR.id,
                    TBLINVITATION.invitationid,
                    TBLINVITATION.invitationcode,
                    TBLTENDER.tenderid,
                    TBLTENDER.tendername,
                    TBLTENDER.tendercode,
                    departmentname,
                    tendertypename,
                    purchasetypename,
                    TO_CHAR(startdate, 'YYYY.MM.DD') startdate,
                    TO_CHAR(enddate, 'YYYY.MM.DD') enddate,
                    TO_CHAR(acceptdate, 'YYYY.MM.DD HH24:MI') acceptdate,
                    TO_CHAR(opendate, 'YYYY.MM.DD HH24:MI') opendate,
                    0 AS recieved,
                    comment.count AS comment,
                    acceptdate::date - CURRENT_DATE AS balanceday,
                    TBLINVITATIONSTATUS.name status,
                    CASE 
                        WHEN acceptdate >= CURRENT_TIMESTAMP 
                        THEN invstatus.name 
                        ELSE 'Хугацаа дууссан'
                    END invstatus
                FROM TBLINVITATION
                INNER JOIN TBLTENDER ON TBLTENDER.tenderid = TBLINVITATION.tenderid
                LEFT JOIN TBLDEPARTMENT ON TBLDEPARTMENT.departmentid = TBLTENDER.departmentid
                LEFT JOIN TBLTENDERTYPE ON TBLTENDERTYPE.tendertypeid = TBLTENDER.tendertypeid
                LEFT JOIN TBLPURCHASETYPE ON TBLPURCHASETYPE.purchasetypeid = TBLTENDER.purchasetypeid
                LEFT JOIN (
                    SELECT COUNT(*) count, invitationid
                    FROM TBLCOMMENT
                    WHERE seen = 0 AND vendorid > 0
                    GROUP BY invitationid
                ) comment ON comment.invitationid = TBLINVITATION.invitationid
                INNER JOIN TBLINVITATIONOFVENDOR ON TBLINVITATIONOFVENDOR.invitationid = TBLINVITATION.invitationid
                INNER JOIN TBLINVITATIONSTATUS ON TBLINVITATIONSTATUS.status = TBLINVITATIONOFVENDOR.status
                INNER JOIN TBLINVITATIONSTATUS invstatus ON invstatus.status = TBLINVITATION.status
                WHERE TBLINVITATIONOFVENDOR.status IN (2,3)
                AND TBLINVITATION.status IN (1,3)
                AND TBLINVITATIONOFVENDOR.vendorid = %s
            """
            params = [vendorid]
            result = run_service(query, params)

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitation_list_involved(vendorid):
     
        result = {"retType": 0, "retMsg": "", "retData": []}

        try:
            query = """
                SELECT
                    TBLINVITATIONOFVENDOR.id,
                    TBLINVITATION.invitationid,
                    TBLINVITATION.invitationcode,
                    TBLTENDER.tenderid,
                    TBLTENDER.tendername,
                    TBLTENDER.tendercode,
                    departmentname,
                    tendertypename,
                    purchasetypename,
                    TO_CHAR(startdate, 'YYYY.MM.DD') startdate,
                    TO_CHAR(enddate, 'YYYY.MM.DD') enddate,
                    TO_CHAR(acceptdate, 'YYYY.MM.DD HH24:MI') acceptdate,
                    TO_CHAR(opendate, 'YYYY.MM.DD HH24:MI') opendate,
                    0 AS recieved,
                    comment.count AS comment,
                    acceptdate::date - CURRENT_DATE AS balanceday,
                    TBLINVITATIONOFVENDOR.note,
                    TBLINVITATIONSTATUS.name status,
                    rejectnote
                FROM TBLINVITATION
                INNER JOIN TBLTENDER ON TBLTENDER.tenderid = TBLINVITATION.tenderid
                LEFT JOIN TBLDEPARTMENT ON TBLDEPARTMENT.departmentid = TBLTENDER.departmentid
                LEFT JOIN TBLTENDERTYPE ON TBLTENDERTYPE.tendertypeid = TBLTENDER.tendertypeid
                LEFT JOIN TBLPURCHASETYPE ON TBLPURCHASETYPE.purchasetypeid = TBLTENDER.purchasetypeid
                LEFT JOIN (
                    SELECT COUNT(*) count, invitationid
                    FROM TBLCOMMENT
                    WHERE seen = 0 AND vendorid > 0
                    GROUP BY invitationid
                ) comment ON comment.invitationid = TBLINVITATION.invitationid
                INNER JOIN TBLINVITATIONOFVENDOR ON TBLINVITATIONOFVENDOR.invitationid = TBLINVITATION.invitationid
                INNER JOIN TBLINVITATIONSTATUS ON TBLINVITATIONSTATUS.status = TBLINVITATIONOFVENDOR.status
                WHERE TBLINVITATIONOFVENDOR.status IN (4,5)
                AND TBLINVITATION.status IN (3,7,8)
                AND TBLINVITATIONOFVENDOR.vendorid = %s
            """
            params = [vendorid]
            result = run_service(query, params)

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result

    def get_invitation_list_by_filter(filter):
 
        result = {"retType": 0, "retMsg": "", "retData": []}

        try:
            sql_text = """
                SELECT
                    TBLINVITATION.invitationid,
                    TBLINVITATION.invitationcode,
                    TBLTENDER.tendername,
                    departmentname,
                    tendertypename,
                    purchasetypename,
                    TO_CHAR(startdate, 'YYYY.MM.DD') startdate,
                    TO_CHAR(enddate, 'YYYY.MM.DD') enddate,
                    TO_CHAR(publishdate,'YYYY.MM.DD HH24:MI') publishdate,
                    TO_CHAR(acceptdate, 'YYYY.MM.DD HH24:MI') acceptdate,
                    TO_CHAR(opendate, 'YYYY.MM.DD HH24:MI') opendate,
                    1 AS recieved,
                    1 AS clarification,
                    acceptdate::date - CURRENT_DATE AS balanceday
                FROM TBLINVITATION
                INNER JOIN TBLTENDER ON TBLTENDER.tenderid = TBLINVITATION.tenderid
                LEFT JOIN TBLDEPARTMENT ON TBLDEPARTMENT.departmentid = TBLTENDER.departmentid
                LEFT JOIN TBLTENDERTYPE ON TBLTENDERTYPE.tendertypeid = TBLTENDER.tendertypeid
                LEFT JOIN TBLPURCHASETYPE ON TBLPURCHASETYPE.purchasetypeid = TBLTENDER.purchasetypeid
                WHERE 1=1
            """

            params = []

            # Date filter
            if filter.get("filterDate"):
                sql_text += " AND %s::date BETWEEN acceptdate::date AND opendate::date"
                params.append(filter["filterDate"])

            # Tender name filter
            if filter.get("tenderName"):
                sql_text += " AND TBLTENDER.tendername LIKE %s"
                params.append(f"%{filter['tenderName']}%")

            # Invitation code filter
            if filter.get("invitationCode"):
                sql_text += " AND TBLINVITATION.invitationcode LIKE %s"
                params.append(f"%{filter['invitationCode']}%")

            # Tender type filter
            if filter.get("tenderTypeID", 0):
                sql_text += " AND TBLTENDER.tendertypeid = %s"
                params.append(filter["tenderTypeID"])

            result = run_service(sql_text, params)

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    
    def get_invitation_count_by_vendor(vendorid: int):
        
        result = {"retType": 0, "retMsg": "", "retData": []}
        
        try:
            sql_text = """
            WITH countTender AS (
                SELECT COUNT(*) AS possibleTender, 0 AS activeTender, 0 AS involvedTender
                FROM TBLINVITATION
                WHERE TBLINVITATION.status IN (1)
                AND acceptdate >= CURRENT_TIMESTAMP
                
                UNION ALL
                
                SELECT 0 AS possibleTender, COUNT(*) AS activeTender, 0 AS involvedTender
                FROM TBLINVITATION
                WHERE TBLINVITATION.status IN (1,3)
                AND acceptdate >= CURRENT_TIMESTAMP
                AND TBLINVITATION.invitationid IN (
                    SELECT DISTINCT invitationid
                    FROM TBLINVITATIONOFVENDOR
                    WHERE vendorid = %s AND status IN (2,3,4,5)
                )
                
                UNION ALL
                
                SELECT 0 AS possibleTender, 0 AS activeTender, COUNT(*) AS involvedTender
                FROM TBLINVITATION
                WHERE TBLINVITATION.status IN (7)
                AND TBLINVITATION.invitationid IN (
                    SELECT DISTINCT invitationid
                    FROM TBLINVITATIONOFVENDOR
                    WHERE vendorid = %s AND status IN (4,5)
                )
            )
            SELECT
                SUM(possibleTender) AS possibleTender,
                SUM(activeTender) AS activeTender,
                SUM(involvedTender) AS involvedTender
            FROM countTender
            """

            result = run_service(sql_text, [vendorid, vendorid])

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_invitation_to_pdf(tenderid: int, invitationid: int):
        r_data = [None] * 5
        try:
            inv_id = invitationid

            # 1️⃣ Get invitation ID if 0
            if invitationid == 0:
                sql = """
                SELECT invitationid 
                FROM TBLINVITATION
                WHERE status <> 10 AND tenderid = %s
                """
                df = execute_query(sql, (tenderid,))
                if not df.empty:
                    inv_id = int(df.iloc[0]['invitationid'])

            # 2️⃣ Get invitation main info
            sql = r"""
            SELECT tendername, description, 
                TO_CHAR(startdate, 'YYYY.MM.DD HH24:MI') AS startdate,
                TO_CHAR(enddate, 'YYYY.MM.DD HH24:MI') AS enddate,
                TO_CHAR(acceptdate, 'YYYY.MM.DD HH24:MI') AS acceptdate,
                TO_CHAR(opendate, 'YYYY.MM.DD HH24:MI') AS opendate
            FROM TBLINVITATION
            INNER JOIN TBLTENDER ON TBLTENDER.tenderid = TBLINVITATION.tenderid
            WHERE invitationid = %s AND TBLINVITATION.tenderid = %s
            """
            r_data[0] = execute_query(sql, (inv_id, tenderid))

            # 3️⃣ Get criteria
            sql = r"""
            SELECT TBLCRITERIA.*, TBLCRITERIATYPE.criteriatypename
            FROM TBLCRITERIA
            INNER JOIN TBLCRITERIATYPE ON TBLCRITERIA.criteriatypeid = TBLCRITERIATYPE.criteriatypeid
            WHERE visible = 1 AND invitationid = %s
            """
            r_data[1] = execute_query(sql, (inv_id,))

            # 4️⃣ Get requirements
            sql = r"""
            SELECT TBLREQUIRE.*, requirevalue
            FROM TBLREQUIRE
            INNER JOIN TBLREQUIRETYPE ON TBLREQUIRE.requiretypeid = TBLREQUIRETYPE.id
            WHERE visible = 1 AND invitationid = %s
            """
            r_data[2] = execute_query(sql, (inv_id,))

            # 5️⃣ Get notes
            sql = "SELECT * FROM TBLNOTES WHERE invitationid = %s"
            r_data[3] = execute_query(sql, (inv_id,))

            # 6️⃣ Get tender documents
            sql = "SELECT * FROM TBLTENDERDOC WHERE invitationid = %s"
            r_data[4] = execute_query(sql, (inv_id,))

            return {"retType": 0, "retMsg": "", "retData": r_data}

        except Exception as ex:
            # Log error like in C#
            print(f"Error: {ex}")
            return {"retType": 1, "retMsg": str(ex), "retData": r_data}
        
    def get_invitation_dtl(invitationid):
        rData = [None] * 8
        result = {'retType': 0, 'retMsg': '', 'retData': rData}

        try:
            with connection.cursor() as cursor:
                # 1. Invitation basic info
                cursor.execute("""
                    SELECT TBLINVITATION.tenderid, tendername, departmentname, tendertypename,
                        purchasetypename, tendercode, invitationcode,
                        description, 
                        TO_CHAR(publishdate, 'YYYY.MM.DD HH24:MI') startdate,
                        TO_CHAR(acceptdate, 'YYYY.MM.DD HH24:MI') enddate,
                        TO_CHAR(opendate, 'YYYY.MM.DD HH24:MI') opendate,
                        acceptdate::date - CURRENT_DATE AS balanceday,
                        TBLINVITATION.status, TBLINVITATIONSTATUS.name statusname, delaynote,
                        CASE WHEN EXTRACT(YEAR FROM TBLINVITATION.acceptdate) BETWEEN 1 AND 9999 THEN TBLINVITATION.acceptdate END AS acceptdate_iso,
                        CASE WHEN EXTRACT(YEAR FROM TBLINVITATION.opendate) BETWEEN 1 AND 9999 THEN TBLINVITATION.opendate END AS opendate_iso
                    FROM TBLINVITATION
                    INNER JOIN TBLTENDER ON TBLTENDER.tenderid = TBLINVITATION.tenderid
                    LEFT JOIN TBLDEPARTMENT ON TBLDEPARTMENT.departmentid = TBLTENDER.departmentid
                    LEFT JOIN TBLTENDERTYPE ON TBLTENDERTYPE.tendertypeid = TBLTENDER.tendertypeid
                    LEFT JOIN TBLPURCHASETYPE ON TBLPURCHASETYPE.purchasetypeid = TBLTENDER.purchasetypeid
                    LEFT JOIN TBLINVITATIONSTATUS ON TBLINVITATIONSTATUS.status = TBLINVITATION.status
                    WHERE TBLINVITATION.invitationid = %s
                """, [invitationid])
                rData[0] = dictfetchall(cursor)

                # 2. Criteria
                cursor.execute("""
                    SELECT criteriaid, TBLCRITERIA.criteriatypeid, criteriatypename, criterianame, weight, visible
                    FROM TBLCRITERIA
                    INNER JOIN TBLCRITERIATYPE ON TBLCRITERIA.CRITERIATYPEID = TBLCRITERIATYPE.CRITERIATYPEID
                    WHERE visible = 1 AND INVITATIONID = %s
                    ORDER BY criteriaid
                """, [invitationid])
                rData[1] = dictfetchall(cursor)

                # 3. Requirements
                cursor.execute("""
                    SELECT TBLREQUIRE.*, requirevalue, TBLCRITERIA.criterianame
                    FROM TBLREQUIRE
                    INNER JOIN TBLREQUIRETYPE ON TBLREQUIRE.requiretypeid = TBLREQUIRETYPE.id
                    LEFT JOIN TBLCRITERIA ON TBLCRITERIA.criteriaid = TBLREQUIRE.criteriaid
                    WHERE TBLREQUIRE.visible = 1 AND TBLREQUIRE.invitationid = %s
                """, [invitationid])
                rData[2] = dictfetchall(cursor)

                # 4. Notes
                cursor.execute("SELECT * FROM TBLNOTES WHERE invitationid = %s", [invitationid])
                rData[3] = dictfetchall(cursor)

                # 5. Tender Documents
                cursor.execute("""
                    SELECT docid, TBLTENDERDOC.doctypeid, TBLTENDERDOC.batchid, TBLTENDERBATCH.batchcode, TBLTENDERBATCH.batchname,
                        documentcode, documentname, doctypename, filename, sourceid, sourcetype,
                        filetype, filepath, TBLTENDERDOC.created, TBLTENDERDOC.createdby
                    FROM TBLTENDERDOC
                    LEFT JOIN TBLTENDERDOCTYPE ON TBLTENDERDOC.DOCTYPEID = TBLTENDERDOCTYPE.DOCTYPEID
                    INNER JOIN TBLFILES ON TBLFILES.sourceid = TBLTENDERDOC.docid AND TBLFILES.sourcetype = 'TenderDoc'
                    LEFT JOIN TBLINVITATION ON TBLINVITATION.invitationid = TBLTENDERDOC.invitationid
                    LEFT JOIN TBLTENDERBATCH ON TBLINVITATION.tenderid = TBLTENDERBATCH.tenderid AND TBLTENDERBATCH.batchid = TBLTENDERDOC.batchid
                    WHERE TBLINVITATION.INVITATIONID = %s
                """, [invitationid])
                rData[4] = dictfetchall(cursor)

                # 6. Tender Batches
                cursor.execute("""
                    SELECT * FROM TBLTENDERBATCH WHERE tenderid IN
                    (SELECT tenderid FROM TBLINVITATION WHERE invitationid = %s)
                """, [invitationid])
                rData[5] = dictfetchall(cursor)

                # 7. Comments
                cursor.execute("""
                    SELECT * FROM TBLCOMMENT WHERE invitationid = %s ORDER BY commentdate
                """, [invitationid])
                rData[6] = dictfetchall(cursor)

                # 8. Evaluation committee linked to the employee directory.
                cursor.execute("""
                    SELECT e.evaluationid, e.empid, emp.empname, emp.positionname, emp.email,
                        e.roleid, mt.membertypename
                    FROM TBLEVALUATION e
                    INNER JOIN TBLEMP emp ON emp.empid = e.empid
                    LEFT JOIN TBLMEMBERTYPE mt ON mt.membertypeid = e.roleid
                    WHERE e.invitationid = %s
                    ORDER BY e.evaluationid
                """, [invitationid])
                rData[7] = dictfetchall(cursor)

        except Exception as ex:
            result['retType'] = 1
            result['retMsg'] = str(ex)

        result['retData'] = rData
        return result
    
    def get_joinwork_dtl(joinworkid):
        ret_data = [None] * 7
        ret_type = 0
        ret_msg = ""

        try:
            with connection.cursor() as cursor:
                # 1️⃣ JoinWork main info
                cursor.execute("""
                    SELECT joinworkid, joinworkcode, joinworkname, TBLJOINWORK.departmentid, TBLJOINWORK.tendertypeid,
                        departmentname, tendertypename, note,
                        TO_CHAR(startdate, 'YYYY.MM.DD') AS startdate,
                        TO_CHAR(enddate, 'YYYY.MM.DD') AS enddate,
                        created, createdby, worklocation, workduration,
                        product_requirement, owner_products_supply,
                        TBLJOINWORK.status, TBLINVITATIONSTATUS.name AS statusname, is_master_contract
                    FROM TBLJOINWORK
                    INNER JOIN TBLDEPARTMENT ON TBLDEPARTMENT.departmentid = TBLJOINWORK.departmentid
                    INNER JOIN TBLTENDERTYPE ON TBLTENDERTYPE.tendertypeid = TBLJOINWORK.tendertypeid
                    INNER JOIN TBLINVITATIONSTATUS ON TBLINVITATIONSTATUS.status = TBLJOINWORK.status
                    WHERE TBLJOINWORK.joinworkid = %s
                """, [joinworkid])
                ret_data[0] = dictfetchall(cursor)

                # 2️⃣ Criteria list
                cursor.execute("""
                    SELECT criteriaid, TBLCRITERIA.criteriatypeid, criteriatypename, criterianame, weight, visible
                    FROM TBLCRITERIA
                    INNER JOIN TBLCRITERIATYPE ON TBLCRITERIA.CRITERIATYPEID = TBLCRITERIATYPE.CRITERIATYPEID
                    WHERE visible = 1 AND joinworkid = %s
                    ORDER BY criteriaid
                """, [joinworkid])
                ret_data[1] = dictfetchall(cursor)

                # 3️⃣ Requirements
                cursor.execute("""
                    SELECT TBLREQUIRE.*, requirevalue, TBLCRITERIA.criterianame
                    FROM TBLREQUIRE
                    INNER JOIN TBLREQUIRETYPE ON TBLREQUIRE.requiretypeid = TBLREQUIRETYPE.id
                    INNER JOIN TBLCRITERIA ON TBLCRITERIA.criteriaid = TBLREQUIRE.criteriaid
                    WHERE TBLREQUIRE.visible = 1 AND TBLREQUIRE.joinworkid = %s
                """, [joinworkid])
                ret_data[2] = dictfetchall(cursor)

                # 4️⃣ Notes
                cursor.execute("SELECT * FROM TBLNOTES WHERE joinworkid = %s", [joinworkid])
                ret_data[3] = dictfetchall(cursor)

                # 5️⃣ Tender documents
                cursor.execute("""
                    SELECT docid, TBLTENDERDOC.doctypeid, documentcode, documentname, doctypename,
                        filename, sourceid, sourcetype, filetype, filepath,
                        TBLTENDERDOC.created, TBLTENDERDOC.createdby
                    FROM TBLTENDERDOC
                    INNER JOIN TBLTENDERDOCTYPE ON TBLTENDERDOC.DOCTYPEID = TBLTENDERDOCTYPE.DOCTYPEID
                    INNER JOIN TBLFILES ON TBLFILES.sourceid = TBLTENDERDOC.docid AND TBLFILES.sourcetype = 'TenderDoc'
                    LEFT JOIN TBLJOINWORK ON TBLJOINWORK.joinworkid = TBLTENDERDOC.joinworkid
                    WHERE TBLJOINWORK.joinworkid = %s
                """, [joinworkid])
                ret_data[4] = dictfetchall(cursor)

                # 6️⃣ Join work tasks
                cursor.execute("""
                    SELECT jointaskid, joinworkid, taskname, taskdetail, created, createdby
                    FROM TBLJOINWORKTASK
                    WHERE joinworkid = %s
                """, [joinworkid])
                ret_data[5] = dictfetchall(cursor)

                # 7️⃣ Comments
                cursor.execute("SELECT * FROM TBLCOMMENT WHERE joinworkid = %s ORDER BY commentdate", [joinworkid])
                ret_data[6] = dictfetchall(cursor)

        except Exception as e:
            ret_type = 1
            ret_msg = str(e)

        return {"retType": ret_type, "retMsg": ret_msg, "retData": ret_data}
    
    def get_comments_by_vendor(invitationid, vendorid):
        ret_type = 0
        ret_msg = ""
        ret_data = []

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT *
                    FROM TBLCOMMENT
                    WHERE vendorid IN (0, %s) AND invitationid = %s
                    ORDER BY commentdate
                """, [vendorid, invitationid])

                ret_data = dictfetchall(cursor)

        except Exception as e:
            ret_type = 1
            ret_msg = str(e)

        return {"retType": ret_type, "retMsg": ret_msg, "retData": ret_data}
    
    def get_tender_doc_list(invitationid=0, joinworkid=0):
        ret_type = 0
        ret_msg = ""
        ret_data = []

        try:
            with connection.cursor() as cursor:
                if invitationid > 0:
                    cursor.execute("""
                        SELECT docid, TBLTENDERDOC.doctypeid, TBLTENDERDOC.batchid,
                            TBLTENDERBATCH.batchcode, TBLTENDERBATCH.batchname,
                            documentcode, documentname, doctypename,
                            filename, sourceid, sourcetype, filetype, filepath,
                            TBLTENDERDOC.created, TBLTENDERDOC.createdby
                        FROM TBLTENDERDOC
                        INNER JOIN TBLTENDERDOCTYPE ON TBLTENDERDOC.DOCTYPEID = TBLTENDERDOCTYPE.DOCTYPEID
                        INNER JOIN TBLFILES ON TBLFILES.sourceid = TBLTENDERDOC.docid AND TBLFILES.sourcetype = 'TenderDoc'
                        LEFT JOIN TBLINVITATION ON TBLINVITATION.invitationid = TBLTENDERDOC.invitationid
                        LEFT JOIN TBLTENDERBATCH ON TBLINVITATION.tenderid = TBLTENDERBATCH.tenderid
                            AND TBLTENDERBATCH.batchid = TBLTENDERDOC.batchid
                        WHERE TBLINVITATION.invitationid = %s
                    """, [invitationid])
                elif joinworkid > 0:
                    cursor.execute("""
                        SELECT docid, TBLTENDERDOC.doctypeid,
                            documentcode, documentname, doctypename,
                            filename, sourceid, sourcetype, filetype, filepath,
                            TBLTENDERDOC.created, TBLTENDERDOC.createdby
                        FROM TBLTENDERDOC
                        INNER JOIN TBLTENDERDOCTYPE ON TBLTENDERDOC.DOCTYPEID = TBLTENDERDOCTYPE.DOCTYPEID
                        INNER JOIN TBLFILES ON TBLFILES.sourceid = TBLTENDERDOC.docid AND TBLFILES.sourcetype = 'TenderDoc'
                        LEFT JOIN TBLJOINWORK ON TBLJOINWORK.joinworkid = TBLTENDERDOC.joinworkid
                        WHERE TBLJOINWORK.joinworkid = %s
                    """, [joinworkid])

                ret_data = dictfetchall(cursor)

        except Exception as e:
            ret_type = 1
            ret_msg = str(e)

        return {"retType": ret_type, "retMsg": ret_msg, "retData": ret_data}

    def get_tender_doc_join_list(invitationid, vendorid):
  
        ret_type = 0
        ret_msg = ""
        ret_data = []

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT joindocid, documentname, filename, sourceid, sourcetype,
                        filetype, filepath, TBLTENDERJOINDOC.created, TBLTENDERJOINDOC.createdby,
                        TBLTENDERJOINDOC.requiretypeid, requirevalue, batchcode, batchname
                    FROM TBLTENDERJOINDOC
                    LEFT JOIN TBLREQUIRETYPE ON TBLREQUIRETYPE.id = TBLTENDERJOINDOC.requiretypeid
                    LEFT JOIN TBLTENDERBATCH ON TBLTENDERBATCH.batchid = TBLTENDERJOINDOC.batchid
                    INNER JOIN TBLFILES ON TBLFILES.sourceid = TBLTENDERJOINDOC.joindocid
                                    AND TBLFILES.sourcetype = 'TenderJoinDoc'
                    WHERE vendorid = %s AND invitationid = %s
                """, [vendorid, invitationid])

                ret_data = dictfetchall(cursor)

        except Exception as e:
            ret_type = 1
            ret_msg = str(e)

        return {"retType": ret_type, "retMsg": ret_msg, "retData": ret_data}
    
    def get_tender_doc_join_data(joindocid, invitationid, tenderid):
   
        ret_type = 0
        ret_msg = ""
        r_data = [None, None, None]  

        try:
            with connection.cursor() as cursor:
                # 1️⃣ Join doc details
                cursor.execute("""
                    SELECT joindocid, documentname, filename, sourceid, sourcetype,
                        filetype, filepath, TBLTENDERJOINDOC.created, TBLTENDERJOINDOC.createdby,
                        requiretypeid
                    FROM TBLTENDERJOINDOC
                    INNER JOIN TBLFILES ON TBLFILES.sourceid = TBLTENDERJOINDOC.joindocid
                                    AND TBLFILES.sourcetype = 'TenderJoinDoc'
                    WHERE JOINDOCID = %s
                """, [joindocid])
                r_data[0] = dictfetchall(cursor)

                # 2️⃣ Require types for invitation
                cursor.execute("""
                    SELECT TBLREQUIRETYPE.*
                    FROM TBLREQUIRE
                    INNER JOIN TBLREQUIRETYPE ON TBLREQUIRETYPE.id = TBLREQUIRE.requiretypeid
                    WHERE invitationid = %s
                """, [invitationid])
                r_data[1] = dictfetchall(cursor)

                # 3️⃣ Tender batches
                cursor.execute("""
                    SELECT *
                    FROM TBLTENDERBATCH
                    WHERE tenderid = %s
                """, [tenderid])
                r_data[2] = dictfetchall(cursor)

        except Exception as e:
            ret_type = 1
            ret_msg = str(e)

        return {"retType": ret_type, "retMsg": ret_msg, "retData": r_data}
    
    def get_folder_case_list(invitationid):
    
        ret_type = 0
        ret_msg = ""
        ret_data = []

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT id, documentname, filename, sourceid, sourcetype, filetype, filepath,
                        TBLFOLDERCASE.created, TBLFOLDERCASE.createdby
                    FROM TBLFOLDERCASE
                    INNER JOIN TBLFILES ON TBLFILES.sourceid = TBLFOLDERCASE.id
                                    AND TBLFILES.sourcetype = 'FolderCase'
                    WHERE TBLFOLDERCASE.invitationid = %s
                """, [invitationid])

                ret_data = dictfetchall(cursor)

        except Exception as e:
            ret_type = 1
            ret_msg = str(e)

        return {"retType": ret_type, "retMsg": ret_msg, "retData": ret_data}
    
    def get_folder_case_by_id(folder_id):
        ret_type = 0
        ret_msg = ""
        ret_data = []

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT id, documentname, filename, sourceid, sourcetype, filetype, filepath,
                        TBLFOLDERCASE.created, TBLFOLDERCASE.createdby
                    FROM TBLFOLDERCASE
                    INNER JOIN TBLFILES ON TBLFILES.sourceid = TBLFOLDERCASE.id
                                    AND TBLFILES.sourcetype = 'FolderCase'
                    WHERE TBLFOLDERCASE.id = %s
                """, [folder_id])

                ret_data = dictfetchall(cursor)

        except Exception as e:
            ret_type = 1
            ret_msg = str(e)

        return {"retType": ret_type, "retMsg": ret_msg, "retData": ret_data}
    
    def get_join_work_doc_list(joinworkid, vendorid):

        ret_type = 0
        ret_msg = ""
        ret_data = []

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT joindocid, documentname, filename, sourceid, sourcetype,
                        filetype, filepath, TBLLJOINWORKDOC.created, TBLLJOINWORKDOC.createdby,
                        d.mastercontractdetailid, d.mastercontractdetailreqname, d.mastercontractdetailscore
                    FROM TBLLJOINWORKDOC
                    INNER JOIN TBLFILES ON TBLFILES.sourceid = TBLLJOINWORKDOC.joindocid
                                    AND TBLFILES.sourcetype = 'JoinWorkDoc'
                    LEFT JOIN TBLMASTERCONTRACTDETAIL d
                        ON TBLLJOINWORKDOC.mastercontractdetailid = d.mastercontractdetailid
                    WHERE vendorid = %s AND joinworkid = %s
                """, [vendorid, joinworkid])

                ret_data = dictfetchall(cursor)

        except Exception as e:
            ret_type = 1
            ret_msg = str(e)

        return {"retType": ret_type, "retMsg": ret_msg, "retData": ret_data}
    
    def save_tender_doc(param):
     
        ret_type = 0
        ret_msg = ""
        docid = 0

        try:
            with connection.cursor() as cursor:
                if param.get('docid', 0) == 0:
                    # 1️⃣ Get tendercode
                    cursor.execute("""
                        SELECT tendercode 
                        FROM TBLTENDER 
                        WHERE tenderid IN (SELECT tenderid FROM TBLINVITATION WHERE invitationid = %s)
                    """, [param['invitationid']])
                    row = cursor.fetchone()
                    tendercode = row[0] if row else ""

                    # 2️⃣ Get new document number
                    cursor.execute("""
                        SELECT COUNT(*) 
                        FROM TBLTENDERDOC 
                        WHERE invitationid = %s
                    """, [param['invitationid']])
                    count_row = cursor.fetchone()
                    newnumber = (count_row[0] if count_row else 0) + 1
                    document_code = f"{tendercode}{newnumber:02}"

                    # 3️⃣ Insert new record
                    cursor.execute("""
                        INSERT INTO TBLTENDERDOC
                            (documentcode, documentname, doctypeid, batchid, tenderid, invitationid, created, createdby)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """, [
                        document_code,
                        param['documentname'],
                        param['doctypeid'],
                        param['batchid'],
                        param['tenderid'],
                        param['invitationid'],
                        datetime.now().strftime('%Y.%m.%d %H:%M:%S'),
                        param['createdby']
                    ])

                    # 4️⃣ Get inserted docid
                    cursor.execute("SELECT MAX(docid) FROM TBLTENDERDOC")
                    docid_row = cursor.fetchone()
                    docid = docid_row[0] if docid_row else 0

                else:
                    # Update existing document
                    cursor.execute("""
                        UPDATE TBLTENDERDOC
                        SET documentname = %s, doctypeid = %s, batchid = %s, tenderid = %s, invitationid = %s
                        WHERE docid = %s
                    """, [
                        param['documentname'],
                        param['doctypeid'],
                        param['batchid'],
                        param['tenderid'],
                        param['invitationid'],
                        param['docid']
                    ])
                    docid = param['docid']

        except Exception as e:
            ret_type = 1
            ret_msg = str(e)

        return {"retType": ret_type, "retMsg": ret_msg, "retData": docid}
    
    def save_join_work_document(param):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": 0
        }

        docid = 0

        try:
            with connection.cursor() as cursor:

                if param.get("docid", 0) == 0:

                    # get joinworkcode
                    cursor.execute("""
                        SELECT joinworkcode 
                        FROM TBLJOINWORK 
                        WHERE joinworkid = %s
                    """, [param["joinworkid"]])

                    row = cursor.fetchone()
                    tendercode = row[0] if row else ""

                    # count documents
                    cursor.execute("""
                        SELECT COUNT(*) 
                        FROM TBLTENDERDOC 
                        WHERE joinworkid = %s
                    """, [param["joinworkid"]])

                    count_row = cursor.fetchone()
                    newnumber = (count_row[0] if count_row else 0) + 1

                    documentcode = f"{tendercode}{newnumber:02}"

                    # insert
                    cursor.execute("""
                        INSERT INTO TBLTENDERDOC
                        (documentcode, documentname, doctypeid, joinworkid, created, createdby)
                        VALUES (%s,%s,%s,%s,%s,%s)
                    """, [
                        documentcode,
                        param["documentname"],
                        param["doctypeid"],
                        param["joinworkid"],
                        datetime.now().strftime("%Y.%m.%d %H:%M:%S"),
                        param["createdby"]
                    ])

                    # get new docid
                    cursor.execute("SELECT MAX(docid) FROM TBLTENDERDOC")
                    row = cursor.fetchone()

                    if row:
                        docid = row[0]

                else:

                    cursor.execute("""
                        UPDATE TBLTENDERDOC
                        SET documentname=%s,
                            doctypeid=%s,
                            joinworkid=%s
                        WHERE docid=%s
                    """, [
                        param["documentname"],
                        param["doctypeid"],
                        param["joinworkid"],
                        param["docid"]
                    ])

                    docid = param["docid"]

        except Exception as e:
            result["retType"] = 1
            result["retMsg"] = str(e)

        result["retData"] = docid
        return result
    
    def save_tender_join_doc(param):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": 0
        }

        docid = 0

        try:
            with connection.cursor() as cursor:

                cursor.execute("""
                    INSERT INTO TBLTENDERJOINDOC
                    (documentname, tenderid, invitationid, vendorid, created, createdby, requiretypeid, batchid)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                """, [
                    param["documentname"],
                    param["tenderid"],
                    param["invitationid"],
                    param["vendorid"],
                    datetime.now().strftime("%Y.%m.%d %H:%M:%S"),
                    param["createdby"],
                    param["requiretypeid"],
                    param["batchid"]
                ])

                cursor.execute("SELECT MAX(joindocid) FROM TBLTENDERJOINDOC")
                row = cursor.fetchone()

                if row:
                    docid = row[0]

        except Exception as e:
            result["retType"] = 1
            result["retMsg"] = str(e)

        result["retData"] = docid

        return result
    
    def save_joinwork_doc(param):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": 0
        }

        docid = 0

        try:
            with connection.cursor() as cursor:

                cursor.execute("""
                    INSERT INTO TBLLJOINWORKDOC
                    (documentname, joinworkid, vendorid, created, createdby, mastercontractdetailid)
                    VALUES (%s,%s,%s,%s,%s,%s)
                """, [
                    param["documentname"],
                    param["joinworkid"],
                    param["vendorid"],
                    datetime.now().strftime("%Y.%m.%d %H:%M:%S"),
                    param["createdby"],
                    param["mastercontractdetailid"]
                ])

                cursor.execute("SELECT MAX(joindocid) FROM TBLLJOINWORKDOC")
                row = cursor.fetchone()

                if row:
                    docid = row[0]

        except Exception as e:
            result["retType"] = 1
            result["retMsg"] = str(e)

        result["retData"] = docid

        return result
    
    def save_folder_case(param):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": 0
        }

        docid = 0

        try:
            with connection.cursor() as cursor:

                cursor.execute("""
                    INSERT INTO TBLFOLDERCASE
                    (documentname, invitationid, created, createdby)
                    VALUES (%s,%s,%s,%s)
                """, [
                    param["documentname"],
                    param["invitationid"],
                    datetime.now().strftime("%Y.%m.%d %H:%M:%S"),
                    param["createdby"]
                ])

                cursor.execute("SELECT MAX(id) FROM TBLFOLDERCASE")
                row = cursor.fetchone()

                if row:
                    docid = row[0]

        except Exception as e:
            result["retType"] = 1
            result["retMsg"] = str(e)

        result["retData"] = docid

        return result
    
    def save_tender_doc_file(files):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": None
        }

        try:
            with connection.cursor() as cursor:

                for file in files:

                    # 1️⃣ Get existing files
                    cursor.execute("""
                        SELECT filepath
                        FROM TBLFILES
                        WHERE sourcetype = %s AND sourceid = %s
                    """, [file["sourcetype"], file["sourceid"]])

                    rows = cursor.fetchall()

                    # 2️⃣ Delete physical files
                    for row in rows:
                        filepath = row[0]

                        temp_folder_path = os.path.join(
                            settings.BASE_DIR,
                            "Files",
                            file["sourcetype"],
                            filepath
                        )

                        if os.path.exists(temp_folder_path):
                            os.remove(temp_folder_path)

                    # 3️⃣ Delete DB records
                    cursor.execute("""
                        DELETE FROM TBLFILES
                        WHERE sourcetype='TenderDoc'
                        AND sourceid=%s
                    """, [file["sourceid"]])

                    # 4️⃣ Insert new file record
                    cursor.execute("""
                        INSERT INTO TBLFILES
                        (filename, filetype, filepath, sourceid, sourcetype)
                        VALUES (%s,%s,%s,%s,%s)
                    """, [
                        file["filename"],
                        file["filetype"],
                        file["filepath"],
                        file["sourceid"],
                        file["sourcetype"]
                    ])

        except Exception as e:
            result["retType"] = 1
            result["retMsg"] = str(e)

        return result
    
    def save_vendor_company_doc(param):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": 0
        }

        docid = 0

        try:
            with connection.cursor() as cursor:

                cursor.execute("""
                    INSERT INTO TBLVENDORDOC
                    (documentname, vendorid, created, createdby)
                    VALUES (%s,%s,%s,%s)
                """, [
                    param["documentname"],
                    param["vendorid"],
                    datetime.now().strftime("%Y.%m.%d %H:%M:%S"),
                    param["createdby"]
                ])

                cursor.execute("SELECT MAX(vendordocid) FROM TBLVENDORDOC")
                row = cursor.fetchone()

                if row:
                    docid = row[0]

        except Exception as e:
            result["retType"] = 1
            result["retMsg"] = str(e)

        result["retData"] = docid

        return result
    
    def get_file_path(sourceid, sourcetype):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": None
        }

        try:
            with connection.cursor() as cursor:

                cursor.execute("""
                    SELECT filepath
                    FROM TBLFILES
                    WHERE sourceid = %s AND sourcetype = %s
                """, [sourceid, sourcetype])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                data = []
                for row in rows:
                    data.append(dict(zip(columns, row)))

                result["retData"] = data

        except Exception as e:
            result["retType"] = 1
            result["retMsg"] = str(e)

        return result
    
    def delete_file(sourceid, sourcetype):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": []
        }

        try:
            with connection.cursor() as cursor:

                # 1️⃣ get file paths
                cursor.execute("""
                    SELECT filepath
                    FROM TBLFILES
                    WHERE sourceid=%s AND sourcetype=%s
                """, [sourceid, sourcetype])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                dt_result = [dict(zip(columns, row)) for row in rows]

                # 2️⃣ delete from TBLFILES
                cursor.execute("""
                    DELETE FROM TBLFILES
                    WHERE sourceid=%s AND sourcetype=%s
                """, [sourceid, sourcetype])

                # 3️⃣ delete related records
                if sourcetype == "TenderDoc":

                    cursor.execute("""
                        DELETE FROM TBLTENDERDOC
                        WHERE docid=%s
                    """, [sourceid])

                elif sourcetype == "TenderJoinDoc":

                    cursor.execute("""
                        DELETE FROM TBLTENDERJOINDOC
                        WHERE joindocid=%s
                    """, [sourceid])

                elif sourcetype == "JoinWorkDoc":

                    cursor.execute("""
                        DELETE FROM TBLLJOINWORKDOC
                        WHERE joindocid=%s
                    """, [sourceid])

                elif sourcetype == "FolderCase":

                    cursor.execute("""
                        DELETE FROM TBLFOLDERCASE
                        WHERE id=%s
                    """, [sourceid])

                elif sourcetype == "VendorCompanyDoc":

                    cursor.execute("""
                        DELETE FROM TBLVENDORDOC
                        WHERE vendordocid=%s
                    """, [sourceid])

                result["retData"] = dt_result

        except Exception as e:
            result["retType"] = 1
            result["retMsg"] = str(e)

        return result
    
    def get_tender_doc_initial_data(docid, invitationid):

        result = {
            "retType": 0,
            "retMsg": "",
            "retData": [None, None, None]
        }

        try:
            with connection.cursor() as cursor:

                # 1️⃣ TBLTENDERDOCTYPE
                cursor.execute("""
                    SELECT *
                    FROM TBLTENDERDOCTYPE
                """)
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                result["retData"][0] = [
                    dict(zip(columns, row)) for row in rows
                ]

                # 2️⃣ TenderDoc + file
                cursor.execute("""
                    SELECT docid,
                        TBLTENDERDOC.doctypeid,
                        TBLTENDERDOC.batchid,
                        documentcode,
                        documentname,
                        doctypename,
                        filename,
                        sourceid,
                        sourcetype,
                        filetype,
                        filepath,
                        TBLTENDERDOC.created,
                        TBLTENDERDOC.createdby
                    FROM TBLTENDERDOC
                    INNER JOIN TBLTENDERDOCTYPE
                        ON TBLTENDERDOC.DOCTYPEID = TBLTENDERDOCTYPE.DOCTYPEID
                    INNER JOIN TBLFILES
                        ON TBLFILES.sourceid = TBLTENDERDOC.docid
                        AND TBLFILES.sourcetype = 'TenderDoc'
                    WHERE docid = %s
                """, [docid])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                result["retData"][1] = [
                    dict(zip(columns, row)) for row in rows
                ]

                # 3️⃣ TenderBatch
                if invitationid > 0:

                    cursor.execute("""
                        SELECT *
                        FROM TBLTENDERBATCH
                        WHERE tenderid IN (
                            SELECT tenderid
                            FROM TBLINVITATION
                            WHERE invitationid = %s
                        )
                    """, [invitationid])

                    columns = [col[0] for col in cursor.description]
                    rows = cursor.fetchall()

                    result["retData"][2] = [
                        dict(zip(columns, row)) for row in rows
                    ]

        except Exception as e:
            result["retType"] = 1
            result["retMsg"] = str(e)

        return result
    
    def get_criteria_list(invitationid=0, joinworkid=0):
        result = {
            "retType": 0,
            "retMsg": "",
            "retData": []
        }

        try:
            with connection.cursor() as cursor:

                if invitationid > 0:
                    cursor.execute("""
                        SELECT criteriaid,
                            TBLCRITERIA.criteriatypeid,
                            criteriatypename,
                            criterianame,
                            weight,
                            visible
                        FROM TBLCRITERIA
                        INNER JOIN TBLCRITERIATYPE
                            ON TBLCRITERIA.CRITERIATYPEID = TBLCRITERIATYPE.CRITERIATYPEID
                        WHERE INVITATIONID = %s
                        ORDER BY criteriaid
                    """, [invitationid])

                elif joinworkid > 0:
                    cursor.execute("""
                        SELECT criteriaid,
                            TBLCRITERIA.criteriatypeid,
                            criteriatypename,
                            criterianame,
                            weight,
                            visible
                        FROM TBLCRITERIA
                        INNER JOIN TBLCRITERIATYPE
                            ON TBLCRITERIA.CRITERIATYPEID = TBLCRITERIATYPE.CRITERIATYPEID
                        WHERE JOINWORKID = %s
                        ORDER BY criteriaid
                    """, [joinworkid])
                else:
                    # Neither ID provided → return empty
                    result["retData"] = []
                    return result

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                result["retData"] = [dict(zip(columns, row)) for row in rows]

        except Exception as e:
            result["retType"] = 1
            result["retMsg"] = str(e)

        return result
    
    def save_criteria(param: dict):
        result = {"retType": 0, "retMsg": "", "retData": None}

        try:
            with connection.cursor() as cursor:

                if param.get("criteriaid", 0) == 0:
                    # NEW
                    if param.get("invitationid", 0) > 0:
                        cursor.execute("SELECT COALESCE(SUM(weight),0) FROM TBLCRITERIA WHERE invitationid=%s", [param["invitationid"]])
                    elif param.get("joinworkid", 0) > 0:
                        cursor.execute("SELECT COALESCE(SUM(weight),0) FROM TBLCRITERIA WHERE joinworkid=%s", [param["joinworkid"]])
                    total_weight = float(cursor.fetchone()[0]) + float(param["weight"])
                    if total_weight > 100:
                        result["retType"] = 1
                        result["retMsg"] = "Уучлаарай шалгуур үзүүлэлтийн нийлбэр жин 100%-иас хэтэрч байна."
                        return result

                    # Insert new criteria
                    cursor.execute("""
                        INSERT INTO TBLCRITERIA
                        (invitationid, joinworkid, criteriatypeid, criterianame, weight, visible)
                        VALUES (%s,%s,%s,%s,%s,%s)
                    """, [
                        param.get("invitationid", 0),
                        param.get("joinworkid", 0),
                        param["criteriatypeid"],
                        param["criterianame"],
                        param["weight"],
                        param["visible"]
                    ])
                    cursor.execute("SELECT MAX(criteriaid) FROM TBLCRITERIA")
                    newid = cursor.fetchone()[0]

                    for reqid in param.get("requiretypeids", []):
                        if reqid > 0:
                            cursor.execute("""
                                INSERT INTO TBLREQUIRE (invitationid, joinworkid, requiretypeid, visible, criteriaid)
                                VALUES (%s,%s,%s,1,%s)
                            """, [
                                param.get("invitationid", 0),
                                param.get("joinworkid", 0),
                                reqid,
                                newid
                            ])
                    result["retData"] = newid

                else:
                    # UPDATE
                    criteriaid = param["criteriaid"]
                    if param.get("invitationid", 0) > 0:
                        cursor.execute("""
                            SELECT COALESCE(SUM(weight),0) FROM TBLCRITERIA
                            WHERE criteriaid<>%s AND invitationid=%s
                        """, [criteriaid, param["invitationid"]])
                    elif param.get("joinworkid", 0) > 0:
                        cursor.execute("""
                            SELECT COALESCE(SUM(weight),0) FROM TBLCRITERIA
                            WHERE criteriaid<>%s AND joinworkid=%s
                        """, [criteriaid, param["joinworkid"]])
                    total_weight = float(cursor.fetchone()[0]) + float(param["weight"])
                    if total_weight > 100:
                        result["retType"] = 1
                        result["retMsg"] = "Уучлаарай шалгуур үзүүлэлтийн нийлбэр жин 100%-иас хэтэрч байна."
                        return result

                    cursor.execute("""
                        UPDATE TBLCRITERIA
                        SET invitationid=%s, joinworkid=%s, criteriatypeid=%s,
                            criterianame=%s, weight=%s, visible=%s
                        WHERE criteriaid=%s
                    """, [
                        param.get("invitationid", 0),
                        param.get("joinworkid", 0),
                        param["criteriatypeid"],
                        param["criterianame"],
                        param["weight"],
                        param["visible"],
                        criteriaid
                    ])

                    # Delete old requires
                    cursor.execute("DELETE FROM TBLREQUIRE WHERE criteriaid=%s", [criteriaid])

                    # Insert new requires
                    for reqid in param.get("requiretypeids", []):
                        if reqid > 0:
                            cursor.execute("""
                                INSERT INTO TBLREQUIRE (invitationid, joinworkid, requiretypeid, visible, criteriaid)
                                VALUES (%s,%s,%s,1,%s)
                            """, [
                                param.get("invitationid", 0),
                                param.get("joinworkid", 0),
                                reqid,
                                criteriaid
                            ])
                    result["retData"] = criteriaid

        except Exception as e:
            result["retType"] = 1
            result["retMsg"] = str(e)

        return result
    
    def delete_criteria(criteriaid: int):
        result = {"retType": 0, "retMsg": "", "retData": None}
        try:
            with connection.cursor() as cursor:
                # Delete the criteria record
                cursor.execute("DELETE FROM TBLCRITERIA WHERE criteriaid = %s", [criteriaid])
                result["retData"] = criteriaid
        except Exception as e:
            result["retType"] = 1
            result["retMsg"] = str(e)
        return result
    
    def get_criteria_initial_data(criteriaid: int):
        rData = [None] * 4
        result = {"retType": 0, "retMsg": "", "retData": rData}
        
        try:
            with connection.cursor() as cursor:
                # 0: TBLCRITERIATYPE
                cursor.execute("SELECT * FROM TBLCRITERIATYPE")
                rData[0] = dictfetchall(cursor)
                
                # 1: TBLCRITERIA for given criteriaid
                cursor.execute("SELECT * FROM TBLCRITERIA WHERE criteriaid = %s", [criteriaid])
                rData[1] = dictfetchall(cursor)
                
                # 2: TBLREQUIRETYPE
                cursor.execute("SELECT * FROM TBLREQUIRETYPE")
                rData[2] = dictfetchall(cursor)
                
                # 3: requiretypeids linked to criteria
                cursor.execute("SELECT requiretypeid FROM TBLREQUIRE WHERE criteriaid = %s", [criteriaid])
                rData[3] = [row["requiretypeid"] for row in dictfetchall(cursor)]
                
        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)
            
        return result
    
    def get_require_list(invitationid: int):
        result = {"retType": 0, "retMsg": "", "retData": []}
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT r.*, rt.*
                    FROM TBLREQUIRE r
                    INNER JOIN TBLREQUIRETYPE rt ON r.requiretypeid = rt.id
                    WHERE r.invitationid = %s
                """, [invitationid])
                result["retData"] = dictfetchall(cursor)
        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)
        return result
    
    def save_require(param: dict):
        result = {"retType": 0, "retMsg": "", "retData": None}
        try:
            requireid = param.get("requireid", 0)
            invitationid = param.get("invitationid")
            requirename = param.get("requirename")
            requiretypeid = param.get("requiretypeid")
            visible = param.get("visible", 1)

            with connection.cursor() as cursor:
                if requireid == 0:
                    # Insert
                    cursor.execute("""
                        INSERT INTO TBLREQUIRE (invitationid, requirename, requiretypeid, visible)
                        VALUES (%s, %s, %s, %s)
                        RETURNING requireid
                    """, [invitationid, requirename, requiretypeid, visible])
                    requireid = cursor.fetchone()[0]
                else:
                    # Update
                    cursor.execute("""
                        UPDATE TBLREQUIRE
                        SET invitationid=%s, requirename=%s, requiretypeid=%s, visible=%s
                        WHERE requireid=%s
                    """, [invitationid, requirename, requiretypeid, visible, requireid])

            result["retData"] = requireid
        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)
        return result
    
    def delete_require(requireid: int):
        result = {"retType": 0, "retMsg": "", "retData": None}
        try:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM TBLREQUIRE WHERE requireid = %s", [requireid])
        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)
        return result
    
    def get_require_initial_data(requireid: int):
        result = {"retType": 0, "retMsg": "", "retData": None}
        rData = [None, None]

        try:
            with connection.cursor() as cursor:
                # Fetch require by ID
                cursor.execute("SELECT * FROM TBLREQUIRE WHERE requireid = %s", [requireid])
                columns = [col[0] for col in cursor.description]
                rData[0] = [dict(zip(columns, row)) for row in cursor.fetchall()]

                # Fetch all require types
                cursor.execute("SELECT * FROM TBLREQUIRETYPE")
                columns = [col[0] for col in cursor.description]
                rData[1] = [dict(zip(columns, row)) for row in cursor.fetchall()]

            result["retData"] = rData

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result

    def get_note_list(invitationid=0, joinworkid=0):
        result = {"retType": 0, "retMsg": "", "retData": None}
        try:
            with connection.cursor() as cursor:
                if invitationid > 0:
                    cursor.execute("SELECT * FROM TBLNOTES WHERE invitationid = %s", [invitationid])
                elif joinworkid > 0:
                    cursor.execute("SELECT * FROM TBLNOTES WHERE joinworkid = %s", [joinworkid])
                else:
                    result["retData"] = []
                    return result

                columns = [col[0] for col in cursor.description]
                data = [dict(zip(columns, row)) for row in cursor.fetchall()]
                result["retData"] = data

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def save_note(param: dict):
        result = {"retType": 0, "retMsg": "", "retData": None}

        try:
            with connection.cursor() as cursor:
                noteid = param.get("noteid", 0)
                invitationid = param.get("invitationid", 0)
                joinworkid = param.get("joinworkid", 0)

                if invitationid > 0:
                    if noteid == 0:
                        sql = """
                            INSERT INTO TBLNOTES (invitationid, address, phone, email, electron, post)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            RETURNING noteid
                        """
                        cursor.execute(sql, [
                            invitationid,
                            param.get("address"),
                            param.get("phone"),
                            param.get("email"),
                            param.get("electron", 0),
                            param.get("post", 0)
                        ])
                        noteid = cursor.fetchone()[0]
                    else:
                        sql = """
                            UPDATE TBLNOTES
                            SET invitationid=%s, address=%s, phone=%s, email=%s, electron=%s, post=%s
                            WHERE noteid=%s
                        """
                        cursor.execute(sql, [
                            invitationid,
                            param.get("address"),
                            param.get("phone"),
                            param.get("email"),
                            param.get("electron", 0),
                            param.get("post", 0),
                            noteid
                        ])
                elif joinworkid > 0:
                    if noteid == 0:
                        sql = """
                            INSERT INTO TBLNOTES (joinworkid, address, phone, email, electron, post)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            RETURNING noteid
                        """
                        cursor.execute(sql, [
                            joinworkid,
                            param.get("address"),
                            param.get("phone"),
                            param.get("email"),
                            param.get("electron", 0),
                            param.get("post", 0)
                        ])
                        noteid = cursor.fetchone()[0]
                    else:
                        sql = """
                            UPDATE TBLNOTES
                            SET joinworkid=%s, address=%s, phone=%s, email=%s, electron=%s, post=%s
                            WHERE noteid=%s
                        """
                        cursor.execute(sql, [
                            joinworkid,
                            param.get("address"),
                            param.get("phone"),
                            param.get("email"),
                            param.get("electron", 0),
                            param.get("post", 0),
                            noteid
                        ])
                else:
                    result["retType"] = 1
                    result["retMsg"] = "invitationid or joinworkid must be provided"
                    return result

                result["retData"] = noteid

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def delete_note(noteid: int):
        result = {"retType": 0, "retMsg": "", "retData": None}

        try:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM TBLNOTES WHERE noteid = %s", [noteid])

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def get_note_initial_data(noteid: int):
        result = {"retType": 0, "retMsg": "", "retData": None}

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM TBLNOTES WHERE noteid = %s", [noteid])
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                data = [dict(zip(columns, row)) for row in rows]
                result["retData"] = data

        except Exception as ex:
            result["retType"] = 1
            result["retMsg"] = str(ex)

        return result
    
    def save_join_work_product_requirement(joinworkid, products_requirements, owners_product_supply):
        result = {"ret_type": 0, "ret_msg": "", "data": None}
        
        try:
            if joinworkid and joinworkid > 0:
                with connection.cursor() as cursor:
                    sql = """
                        UPDATE TBLJOINWORK
                        SET product_requirement = %s,
                            owner_products_supply = %s
                        WHERE joinworkid = %s
                    """
                    cursor.execute(sql, [products_requirements, owners_product_supply, joinworkid])
                    
                    # Check if update affected rows
                    if cursor.rowcount == 0:
                        result["ret_type"] = 1
                        result["ret_msg"] = f"No JoinWork found with id {joinworkid}"
            else:
                result["ret_type"] = 1
                result["ret_msg"] = "Invalid joinworkid"
        except Exception as ex:
            # Optional: log the error
            print(f"Error in save_join_work_product_requirement: {ex}")
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)
        
        return result
    
    def get_join_work_list_expired():
        result = {"ret_type": 0, "ret_msg": "", "data": []}
        
        try:
            with connection.cursor() as cursor:
                sql = """
                    SELECT
                        j.joinworkid,
                        j.joinworkcode,
                        j.joinworkname,
                        d.departmentname,
                        t.tendertypename,
                        TO_CHAR(j.startdate, 'YYYY.MM.DD') AS startdate,
                        TO_CHAR(j.enddate, 'YYYY.MM.DD') AS enddate,
                        CONCAT( TO_CHAR(j.startdate, 'YYYY.MM.DD'), ' - ', TO_CHAR(j.enddate, 'YYYY.MM.DD')) AS dateinterval,
                        j.created,
                        j.createdby,
                        j.note,
                        j.enddate::date - CURRENT_DATE AS balanceday

                    FROM TBLJOINWORK j
                    INNER JOIN TBLDEPARTMENT d
                        ON d.departmentid = j.departmentid
                    INNER JOIN TBLTENDERTYPE t
                        ON t.tendertypeid = j.tendertypeid
                    WHERE j.enddate::date - CURRENT_DATE < 0
                    ORDER BY j.enddate DESC
                """
                cursor.execute(sql)
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                result["data"] = [dict(zip(columns, row)) for row in rows]
                
        except Exception as ex:
            print(f"Error in get_join_work_list_expired: {ex}")
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)
        
        return result
    
    def get_join_work_list():
        result = {"ret_type": 0, "ret_msg": "", "data": []}
        
        try:
            with connection.cursor() as cursor:
                sql = """
                    SELECT 
                        j.joinworkid,
                        j.joinworkcode,
                        j.joinworkname,
                        d.departmentname,
                        t.tendertypename,
                        TO_CHAR(j.startdate, 'YYYY.MM.DD') AS startdate,
                        TO_CHAR(j.enddate, 'YYYY.MM.DD') AS enddate,
                        CONCAT( TO_CHAR(j.startdate, 'YYYY.MM.DD'), ' - ', TO_CHAR(j.enddate, 'YYYY.MM.DD')) AS dateinterval,
                        j.created,
                        j.createdby,
                        j.note,
                        j.enddate::date - CURRENT_DATE AS balanceday,
                        j.status
                    FROM TBLJOINWORK j
                    INNER JOIN TBLDEPARTMENT d ON d.departmentid = j.departmentid
                    INNER JOIN TBLTENDERTYPE t ON t.tendertypeid = j.tendertypeid
                    WHERE j.enddate::date - CURRENT_DATE > -1
                """
                cursor.execute(sql)
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                result["data"] = [dict(zip(columns, row)) for row in rows]
                
        except Exception as ex:
            print(f"Error in get_join_work_list: {ex}")
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)
        
        return result
    
    def get_join_work_by_id(joinworkid):
        result = {"ret_type": 0, "ret_msg": "", "data": None}
        
        try:
            with connection.cursor() as cursor:
                sql = """
                    SELECT 
                        j.joinworkid,
                        j.joinworkcode,
                        j.joinworkname,
                        d.departmentname,
                        t.tendertypename,
                        TO_CHAR(j.startdate, 'YYYY.MM.DD') AS startdate,
                        TO_CHAR(j.enddate, 'YYYY.MM.DD') AS enddate,
                        j.created,
                        j.createdby,
                        j.note,
                        j.enddate::date - CURRENT_DATE AS balanceday
                    FROM TBLJOINWORK j
                    INNER JOIN TBLDEPARTMENT d ON d.departmentid = j.departmentid
                    INNER JOIN TBLTENDERTYPE t ON t.tendertypeid = j.tendertypeid
                    WHERE j.joinworkid = %s
                """
                cursor.execute(sql, [joinworkid])
                row = cursor.fetchone()
                if row:
                    columns = [col[0] for col in cursor.description]
                    result["data"] = dict(zip(columns, row))
                else:
                    result["ret_type"] = 1
                    result["ret_msg"] = f"No JoinWork found with id {joinworkid}"
        except Exception as ex:
            print(f"Error in get_join_work_by_id: {ex}")
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)
        
        return result
    
    def delete_join_work(joinworkid):
        result = {"ret_type": 0, "ret_msg": "", "data": None}
        
        try:
            with connection.cursor() as cursor:
                sql = "DELETE FROM TBLJOINWORK WHERE joinworkid = %s"
                cursor.execute(sql, [joinworkid])
                
                if cursor.rowcount == 0:
                    result["ret_type"] = 1
                    result["ret_msg"] = f"No JoinWork found with id {joinworkid}"
        except Exception as ex:
            print(f"Error in delete_join_work: {ex}")
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)
        
        return result
    
    def save_join_work(data):

        result = {"ret_type": 0, "ret_msg": "", "data": None}

        try:
            joinworkid = data.get("joinworkid", 0)

            joinworkname = data.get("joinworkname")
            tendertypeid = data.get("tendertypeid")
            departmentid = data.get("departmentid")
            startdate = data.get("startdate")
            enddate = data.get("enddate")
            createdby = data.get("createdby")
            worklocation = data.get("worklocation")
            workduration = data.get("workduration")
            note = data.get("note")
            status = data.get("status")
            is_master_contract = data.get("is_master_contract")

            startdate = datetime.strptime(startdate, "%Y.%m.%d %H:%M:%S")
            enddate = datetime.strptime(enddate, "%Y.%m.%d %H:%M:%S")

            with connection.cursor() as cursor:

                
                if joinworkid == 0:

                    joinworkcode = getNextCode(3, 0, departmentid)

                    sql = """
                        INSERT INTO TBLJOINWORK
                        (joinworkcode, joinworkname, tendertypeid, departmentid,
                        startdate, enddate, createdby, created, note,
                        worklocation, workduration, status, is_master_contract)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,TO_CHAR(CURRENT_TIMESTAMP, 'YYYY.MM.DD HH24:MI:SS'),%s,%s,%s,%s,%s)
                        RETURNING joinworkid
                    """

                    cursor.execute(sql, [
                        joinworkcode,
                        joinworkname,
                        tendertypeid,
                        departmentid,
                        startdate,
                        enddate,
                        createdby,
                        note,
                        worklocation,
                        workduration,
                        status,
                        is_master_contract
                    ])

                    joinworkid = cursor.fetchone()[0]
                    result["data"] = {"joinworkid": joinworkid}

                # UPDATE
                else:

                    sql = """
                        UPDATE TBLJOINWORK
                        SET joinworkname=%s,
                            tendertypeid=%s,
                            departmentid=%s,
                            startdate=%s,
                            enddate=%s,
                            note=%s,
                            worklocation=%s,
                            workduration=%s,
                            is_master_contract=%s
                        WHERE joinworkid=%s
                    """

                    cursor.execute(sql, [
                        joinworkname,
                        tendertypeid,
                        departmentid,
                        startdate,
                        enddate,
                        note,
                        worklocation,
                        workduration,
                        is_master_contract,
                        joinworkid
                    ])

                    result["data"] = {"joinworkid": joinworkid}

        except Exception as ex:
            print("save_join_work error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def publish_join_work_invitation(joinworkid, status):

        result = {"ret_type": 0, "ret_msg": "", "data": None}

        try:
            today = datetime.now().strftime("%Y.%m.%d")

            with connection.cursor() as cursor:
                sql = """
                    UPDATE TBLJOINWORK
                    SET publisheddate = TO_DATE(%s, 'YYYY.MM.DD'),
                        status = %s
                    WHERE joinworkid = %s
                """

                cursor.execute(sql, [today, status, joinworkid])

                if cursor.rowcount == 0:
                    result["ret_type"] = 1
                    result["ret_msg"] = f"No JoinWork found with id {joinworkid}"

        except Exception as ex:
            print("publish_join_work_invitation error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_join_work_list_for_vendor(vendorid):
        result = {"ret_type": 0, "ret_msg": "", "data": []}

        try:
            with connection.cursor() as cursor:

                sql = """
                    SELECT
                        j.joinworkid,
                        j.joinworkcode,
                        j.joinworkname,
                        d.departmentname,
                        t.tendertypename,
                        TO_CHAR(j.startdate, 'YYYY.MM.DD') AS startdate,
                        TO_CHAR(j.enddate, 'YYYY.MM.DD') AS enddate,
                        CONCAT(TO_CHAR(j.startdate, 'YYYY.MM.DD'),' - ',TO_CHAR(j.enddate, 'YYYY.MM.DD')) AS dateinterval,
                        j.created,
                        j.createdby,
                        j.enddate::date - CURRENT_DATE AS balanceday

                    FROM TBLJOINWORK j
                    INNER JOIN TBLDEPARTMENT d
                        ON d.departmentid = j.departmentid
                    INNER JOIN TBLTENDERTYPE t
                        ON t.tendertypeid = j.tendertypeid
                    LEFT JOIN TBLJOINWORKOFVENDOR v
                        ON v.joinworkid = j.joinworkid
                        AND v.vendorid = %s
                    WHERE j.enddate::date >= CURRENT_DATE AND v.joinworkid IS NULL
                """

                cursor.execute(sql, [vendorid])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                result["data"] = [dict(zip(columns, row)) for row in rows]

        except Exception as ex:
            print("get_join_work_list_for_vendor error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_join_work_list_involved(vendorid):

        result = {"ret_type": 0, "ret_msg": "", "data": []}

        try:
            with connection.cursor() as cursor:

                sql = """
                    SELECT
                        j.joinworkid,
                        j.joinworkcode,
                        j.joinworkname,
                        d.departmentname,
                        t.tendertypename,
                        TO_CHAR(j.startdate, 'YYYY.MM.DD') AS startdate,
                        TO_CHAR(j.enddate, 'YYYY.MM.DD') AS enddate,
                        CONCAT(TO_CHAR(j.startdate, 'YYYY.MM.DD'),' - ', TO_CHAR(j.enddate, 'YYYY.MM.DD')) AS dateinterval,

                        j.created,
                        j.createdby,
                        j.enddate::date - CURRENT_DATE AS balanceday,
                        s.status,
                        s.name AS statusname

                    FROM TBLJOINWORK j

                    INNER JOIN TBLDEPARTMENT d
                        ON d.departmentid = j.departmentid

                    INNER JOIN TBLTENDERTYPE t
                        ON t.tendertypeid = j.tendertypeid

                    INNER JOIN TBLJOINWORKOFVENDOR v
                        ON v.joinworkid = j.joinworkid

                    INNER JOIN TBLINVITATIONSTATUS s
                        ON s.status = v.status

                    WHERE v.vendorid = %s
                """

                cursor.execute(sql, [vendorid])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                result["data"] = [dict(zip(columns, row)) for row in rows]

        except Exception as ex:
            print("get_join_work_list_involved error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def send_join_work_of_vendor(vendorid, joinworkid, status, createdby):

        result = {"ret_type": 0, "ret_msg": "", "data": None}

        try:
            with connection.cursor() as cursor:

                # Check if vendor already applied
                check_sql = """
                    SELECT COUNT(*) 
                    FROM TBLJOINWORKOFVENDOR
                    WHERE vendorid = %s AND joinworkid = %s
                """

                cursor.execute(check_sql, [vendorid, joinworkid])
                count = cursor.fetchone()[0]

                if count == 0:

                    insert_sql = """
                        INSERT INTO TBLJOINWORKOFVENDOR
                        (vendorid, joinworkid, status, created, createdby)
                        VALUES (%s, %s, %s, %s, %s)
                    """

                    created = datetime.now()

                    cursor.execute(insert_sql, [
                        vendorid,
                        joinworkid,
                        status,
                        created,
                        createdby
                    ])

                    result["data"] = {
                        "vendorid": vendorid,
                        "joinworkid": joinworkid
                    }

                else:
                    result["ret_msg"] = "Vendor already applied to this JoinWork"

        except Exception as ex:
            print("send_join_work_of_vendor error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_join_work_list_received_list(joinworkid):
        result = {"ret_type": 0, "ret_msg": "", "data": []}

        try:
            with connection.cursor() as cursor:

                sql = """
                SELECT
                    vj.id,
                    v.vendorid,
                    vj.joinworkid,
                    v.vendorname,
                    v.vendortypeid,
                    v.activity,
                    COUNT(d.joindocid) AS filecount,
                    j.is_master_contract
                FROM TBLJOINWORKOFVENDOR vj
                INNER JOIN TBLVENDOR v
                    ON v.vendorid = vj.vendorid
                INNER JOIN TBLLJOINWORKDOC d
                    ON d.joinworkid = vj.joinworkid
                    AND d.vendorid = vj.vendorid
                INNER JOIN TBLJOINWORK j
                    ON j.joinworkid = vj.joinworkid
                WHERE vj.joinworkid = %s
                GROUP BY
                    vj.id,
                    v.vendorid,
                    vj.joinworkid,
                    v.vendorname,
                    v.vendortypeid,
                    v.activity,
                    j.is_master_contract
                """

                cursor.execute(sql, [joinworkid])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                result["data"] = [dict(zip(columns, row)) for row in rows]

        except Exception as ex:
            print("get_join_work_list_received_list error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_join_work_initial_data(joinworkid):

        result = {"ret_type": 0, "ret_msg": "", "data": {}}

        try:
            with connection.cursor() as cursor:

                # 1️⃣ Tender types
                cursor.execute("SELECT * FROM TBLTENDERTYPE")
                columns = [col[0] for col in cursor.description]
                tendertypes = [dict(zip(columns, row)) for row in cursor.fetchall()]

                # 2️⃣ Departments
                cursor.execute("SELECT * FROM TBLDEPARTMENT")
                columns = [col[0] for col in cursor.description]
                departments = [dict(zip(columns, row)) for row in cursor.fetchall()]

                # 3️⃣ JoinWork details
                sql = """
                SELECT
                    j.joinworkid,
                    j.joinworkcode,
                    j.joinworkname,
                    j.departmentid,
                    j.tendertypeid,
                    d.departmentname,
                    t.tendertypename,
                    j.note,
                    TO_CHAR(j.startdate, 'YYYY.MM.DD') startdate,
                    TO_CHAR(j.enddate, 'YYYY.MM.DD') enddate,
                    j.created,
                    j.createdby,
                    j.worklocation,
                    j.workduration,
                    j.product_requirement,
                    j.owner_products_supply,
                    j.status,
                    s.name AS statusname,
                    j.is_master_contract
                FROM TBLJOINWORK j
                INNER JOIN TBLDEPARTMENT d
                    ON d.departmentid = j.departmentid
                INNER JOIN TBLTENDERTYPE t
                    ON t.tendertypeid = j.tendertypeid
                INNER JOIN TBLINVITATIONSTATUS s
                    ON s.status = j.status
                WHERE j.joinworkid = %s
                """

                cursor.execute(sql, [joinworkid])

                columns = [col[0] for col in cursor.description]
                row = cursor.fetchone()

                joinwork = dict(zip(columns, row)) if row else None

                result["data"] = {
                    "tendertypes": tendertypes,
                    "departments": departments,
                    "joinwork": joinwork
                }

        except Exception as ex:
            print("get_join_work_initial_data error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_join_work_task_list(joinworkid):
        result = {"ret_type": 0, "ret_msg": "", "data": []}

        try:
            with connection.cursor() as cursor:
                sql = """
                SELECT
                    jointaskid,
                    joinworkid,
                    taskname,
                    taskdetail,
                    created,
                    createdby
                FROM TBLJOINWORKTASK
                WHERE joinworkid = %s
                """

                cursor.execute(sql, [joinworkid])

                columns = [col[0] for col in cursor.description]

                tasks = [
                    dict(zip(columns, row))
                    for row in cursor.fetchall()
                ]

                result["data"] = tasks

        except Exception as ex:
            print("get_join_work_task_list error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_join_work_task(jointaskid):
        result = {"ret_type": 0, "ret_msg": "", "data": None}

        try:
            with connection.cursor() as cursor:
                sql = """
                SELECT
                    jointaskid,
                    joinworkid,
                    taskname,
                    taskdetail,
                    created,
                    createdby
                FROM TBLJOINWORKTASK
                WHERE jointaskid = %s
                """

                cursor.execute(sql, [jointaskid])

                columns = [col[0] for col in cursor.description]
                row = cursor.fetchone()

                if row:
                    result["data"] = dict(zip(columns, row))

        except Exception as ex:
            print("get_join_work_task error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def delete_join_work_task(jointaskid):
        result = {"ret_type": 0, "ret_msg": ""}

        try:
            with connection.cursor() as cursor:

                sql = """
                DELETE FROM TBLJOINWORKTASK
                WHERE jointaskid = %s
                """

                cursor.execute(sql, [jointaskid])

        except Exception as ex:
            print("delete_join_work_task error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def save_join_work_task(param):

        result = {"ret_type": 0, "ret_msg": ""}

        try:
            with connection.cursor() as cursor:

                if param.get("jointaskid", 0) <= 0:
                    # Insert new task
                    sql = """
                    INSERT INTO TBLJOINWORKTASK (joinworkid, taskname, taskdetail)
                    VALUES (%s, %s, %s)
                    """
                    cursor.execute(sql, [
                        param["joinworkid"],
                        param["taskname"],
                        param["taskdetail"]
                    ])
                else:
                    # Update existing task
                    sql = """
                    UPDATE TBLJOINWORKTASK
                    SET joinworkid = %s,
                        taskname = %s,
                        taskdetail = %s
                    WHERE jointaskid = %s
                    """
                    cursor.execute(sql, [
                        param["joinworkid"],
                        param["taskname"],
                        param["taskdetail"],
                        param["jointaskid"]
                    ])

        except Exception as ex:
            print("save_join_work_task error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def save_vendor(param):
        result = {"ret_type": 0, "ret_msg": "", "ret_data": None}
        vendorid = 0

        try:
            established_date = (
                datetime.strptime(param.get("establisheddate"), "%Y.%m.%d").strftime("%Y.%m.%d")
                if param.get("establisheddate")
                else ""
            )
            with transaction.atomic(), connection.cursor() as cursor:
                activity_ids = normalize_activity_ids(
                    cursor,
                    param.get("activityids", param.get("activityid")),
                )
                activity = ", ".join(activity_names(cursor, activity_ids))
                if param.get("vendorid", 0) == 0:
                    # Check if username exists
                    cursor.execute("SELECT COUNT(*) FROM TBLTENDERUSER WHERE username = %s", [param["username"]])
                    if cursor.fetchone()[0] > 0:
                        result["ret_type"] = -2
                        result["ret_msg"] = "Таны оруулсан нэвтрэх нэр бүртгэлтэй байна."
                        return result

                    # Insert vendor
                    cursor.execute("""
                        INSERT INTO TBLVENDOR (vendorname, registernumber, isvatpayer, vendortypeid, countryname,
                            establisheddate, activity, vendorstatusid, address, vendorphone, vendoremail,
                            bankname, bankaccountname, bankaccountnumber, empname, empphone, empemail, created,
                            headcompany, shareholder, website)
                        VALUES (%s,%s,%s,%s,%s,TO_DATE(NULLIF(BTRIM(%s), ''), 'YYYY.MM.DD'),%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                            %s,%s,%s,%s)
                        RETURNING vendorid
                    """, [
                        param["vendorname"], param["registernumber"], param["isvatpayer"], param["vendortypeid"],
                        param["countryname"], established_date, activity, param["vendorstatusid"],
                        param["address"], param["vendorphone"], param["vendoremail"], param["bankname"],
                        param["bankaccountname"], param["bankaccountnumber"], param["empname"], param["empphone"],
                        param["empemail"], datetime.now().strftime("%Y.%m.%d %H:%M:%S"), param["headcompany"],
                        param["shareholder"], param["website"]
                    ])
                    vendorid = cursor.fetchone()[0]

                    # Insert vendor categories
                    category_ids = [int(cid) for cid in param.get("vendorcategory_ids", "").split(",") if cid]
                    for cid in category_ids:
                        cursor.execute(
                            "INSERT INTO TBLVENDORCATEGORYREL (vendorid, erpcategoryid) VALUES (%s, %s)",
                            [vendorid, cid]
                        )

                    # Insert tender user with hashed password
                    pepper = settings.PASSWORD_PEPPER
                    password_salt = PasswordHasher.generate_salt()
                    password_hash = PasswordHasher.compute_hash(str(param["password"]), password_salt, pepper, 3)

                    cursor.execute("""
                        INSERT INTO TBLTENDERUSER (username, passwordhash, passwordsalt, empname, vendorid)
                        VALUES (%s,%s,%s,%s,%s)
                    """, [param["username"], password_hash, password_salt, param["vendorname"], vendorid])

                else:
                    # Update existing vendor
                    vendorid = param["vendorid"]
                    cursor.execute("""
                        UPDATE TBLVENDOR SET vendorname=%s, registernumber=%s, isvatpayer=%s, vendortypeid=%s,
                            countryname=%s,
                            establisheddate=TO_DATE(NULLIF(BTRIM(%s), ''), 'YYYY.MM.DD'),
                            activity=%s,
                            vendorstatusid=%s, address=%s, vendorphone=%s, vendoremail=%s, bankname=%s,
                            bankaccountname=%s, bankaccountnumber=%s, empname=%s, empphone=%s, empemail=%s,
                            updated=%s, headcompany=%s, shareholder=%s, website=%s
                        WHERE vendorid=%s
                    """, [
                        param["vendorname"], param["registernumber"], param["isvatpayer"], param["vendortypeid"],
                        param["countryname"], established_date, activity, param["vendorstatusid"],
                        param["address"], param["vendorphone"], param["vendoremail"], param["bankname"],
                        param["bankaccountname"], param["bankaccountnumber"], param["empname"], param["empphone"],
                        param["empemail"], datetime.now().strftime("%Y.%m.%d %H:%M:%S"), param["headcompany"],
                        param["shareholder"], param["website"], vendorid
                    ])

                    # Only replace categories when the caller explicitly submits them.
                    if "vendorcategory_ids" in param:
                        cursor.execute("DELETE FROM TBLVENDORCATEGORYREL WHERE vendorid=%s", [vendorid])
                        category_ids = [int(cid) for cid in param.get("vendorcategory_ids", "").split(",") if cid]
                        for cid in category_ids:
                            cursor.execute(
                                "INSERT INTO TBLVENDORCATEGORYREL (vendorid, erpcategoryid) VALUES (%s, %s)",
                                [vendorid, cid]
                            )

                sync_vendor_activities(cursor, vendorid, activity_ids)

            result["ret_data"] = param.get("username")

        except Exception as ex:
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_vendor_info(vendorid):
        result = {"ret_type": 0, "ret_msg": "", "ret_data": None}
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT TBLVENDOR.*, TO_CHAR(establisheddate, 'YYYY.MM.DD') AS establisheddate
                    FROM TBLVENDOR
                    WHERE vendorid = %s
                """, [vendorid])
                columns = [col[0] for col in cursor.description]
                row = cursor.fetchone()
                if row:
                    result["ret_data"] = dict(zip(columns, row))
                    cursor.execute(
                        "SELECT activityid FROM vendor_activity_relation WHERE vendorid=%s ORDER BY activityid",
                        [vendorid],
                    )
                    result["ret_data"]["activityids"] = [activity[0] for activity in cursor.fetchall()]
                else:
                    result["ret_data"] = {}
        except Exception as ex:
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)
        return result
    
    def get_vendor_category(vendorid):
        result = {"ret_type": 0, "ret_msg": "", "ret_data": []}
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT erpcategoryid 
                    FROM TBLVENDORCATEGORYREL 
                    WHERE vendorid = %s
                """, [vendorid])
                rows = cursor.fetchall()
                # Convert rows to list of dicts
                result["ret_data"] = [{"erpcategoryid": row[0]} for row in rows]
        except Exception as ex:
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)
        return result
    
    def get_all_vendors_category():
        result = {"ret_type": 0, "ret_msg": "", "ret_data": []}
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT erpcategoryid, vendorid
                    FROM TBLVENDORCATEGORYREL
                    GROUP BY vendorid, erpcategoryid
                    ORDER BY vendorid
                """)
                rows = cursor.fetchall()
                # Convert rows into list of dicts
                result["ret_data"] = [{"vendorid": row[1], "erpcategoryid": row[0]} for row in rows]
        except Exception as ex:
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)
        return result
    
    def get_vendors():
        result = {"ret_type": 0, "ret_msg": "", "ret_data": []}

        try:
            with connection.cursor() as cursor:
                # Fetch all vendors
                cursor.execute("""
                    SELECT vendorid, vendorname, registernumber, vendorstatusid, vendortypeid,
                        created, empname, vendoremail, vendorphone, empphone, activity
                    FROM TBLVENDOR
                    ORDER BY vendorid
                """)
                vendors = cursor.fetchall()
                columns = [col[0] for col in cursor.description]

                for vendor in vendors:
                    vendor_dict = dict(zip(columns, vendor))

                    # Fetch vendor categories for this vendor
                    cursor.execute("""
                        SELECT erpcategoryid
                        FROM TBLVENDORCATEGORYREL
                        WHERE vendorid = %s
                    """, [vendor_dict["vendorid"]])
                    categories = [str(row[0]) for row in cursor.fetchall()]
                    vendor_dict["activity_id"] = ", ".join(categories)
                    vendor_dict["activity"] = ""
                    vendor_dict["activityOld"] = vendor_dict.get("activity", "")

                    result["ret_data"].append(vendor_dict)

        except Exception as ex:
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def create_file_from_base64(base64_file, file_name, file_ext):
        import base64

        # Decode Base64 string
        file_bytes = base64.b64decode(base64_file)
        file_stream = io.BytesIO(file_bytes)

        # Prepare file info
        saved_file_name = f"{file_name}.{file_ext}"

        # Create InMemoryUploadedFile (similar to C# FormFile)
        uploaded_file = InMemoryUploadedFile(
            file=file_stream,
            field_name=file_name,
            name=saved_file_name,
            content_type="application/octet-stream",  # generic mimetype
            size=file_stream.getbuffer().nbytes,
            charset=None
        )
        return uploaded_file
    
    def save_comment(comment_data):
        result = {"RetType": 0, "RetMsg": "Success"}

        try:
            comment_title = comment_data.get('commenttitle', '')
            comment_text = comment_data.get('comment', '')
            vendor_id = comment_data.get('vendorid')
            invitation_id = comment_data.get('invitationid')
            comment_date = datetime.now().strftime("%Y.%m.%d %H:%M:%S")

            with connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO TBLCOMMENT 
                    (commenttitle, commentdate, comment, vendorid, seen, invitationid)
                    VALUES (%s, TO_TIMESTAMP(%s, 'YYYY.MM.DD HH24:MI:SS'), %s, %s, 0, %s)
                """, [comment_title, comment_date, comment_text, vendor_id, invitation_id])

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def get_comment_count(invitation_id):
        result = {"RetType": 0, "RetMsg": "Success", "count": 0}

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM TBLCOMMENT 
                    WHERE seen = 0 AND vendorid > 0 AND invitationid = %s
                """, [invitation_id])
                row = cursor.fetchone()
                result["count"] = row[0] if row else 0

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def get_comments(invitation_id, vendor_id):
        result = {"RetType": 0, "RetMsg": "Success", "comments": []}

        try:
            with connection.cursor() as cursor:
                # If vendorid < 1, mark comments as seen
                if vendor_id < 1:
                    cursor.execute("""
                        UPDATE TBLCOMMENT 
                        SET seen = 1 
                        WHERE invitationid = %s
                    """, [invitation_id])

                # Select comments ordered by commentdate
                cursor.execute("""
                    SELECT commentid, commenttitle, commentdate, comment, vendorid, seen, invitationid
                    FROM TBLCOMMENT
                    WHERE invitationid = %s
                    ORDER BY commentdate
                """, [invitation_id])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                # Convert each row to a dict
                for row in rows:
                    comment_dict = OrderedDict(zip(columns, row))
                    result["comments"].append(comment_dict)

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def get_qoute_list(invitation_id, vendor_id):
        result = {"RetType": 0, "RetMsg": "Success", "quotes": []}

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        qouteid,
                        TBLTENDER.tendername,
                        TBLTENDER.tendercode,
                        TO_CHAR(qoutedate, 'YYYY.MM.DD') AS qoutedate,
                        TO_CHAR(deliverydate, 'YYYY.MM.DD') AS deliverydate,
                        qouteamount,
                        deliveryday,
                        TBLTENDERBATCH.batchname
                    FROM TBLQOUTE
                    INNER JOIN TBLTENDER ON TBLTENDER.tenderid = TBLQOUTE.tenderid
                    LEFT JOIN TBLTENDERBATCH ON TBLTENDERBATCH.batchid = TBLQOUTE.batchid
                    WHERE vendorid = %s AND invitationid = %s
                """, [vendor_id, invitation_id])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                for row in rows:
                    quote_dict = OrderedDict(zip(columns, row))
                    result["quotes"].append(quote_dict)

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def get_qoute_by_id(qoute_id, tender_id):
        result = {"RetType": 0, "RetMsg": "Success", "RetData": [[], []]}

        try:
            with connection.cursor() as cursor:
                # First query: quote details
                cursor.execute("""
                    SELECT 
                        qouteid,
                        TBLTENDER.tendername,
                        TBLTENDER.tendercode,
                        TO_CHAR(qoutedate, 'YYYY.MM.DD HH24:MI') AS qoutedate,
                        qouteamount,
                        deliveryday,
                        TBLQOUTE.batchid,
                        TO_CHAR(deliverydate, 'YYYY.MM.DD HH24:MI') AS deliverydate
                    FROM TBLQOUTE
                    INNER JOIN TBLTENDER ON TBLTENDER.tenderid = TBLQOUTE.tenderid
                    WHERE qouteid = %s
                """, [qoute_id])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                quote_list = [OrderedDict(zip(columns, row)) for row in rows]
                result["RetData"][0] = quote_list

                # Second query: tender batches
                cursor.execute("""
                    SELECT * 
                    FROM TBLTENDERBATCH 
                    WHERE tenderid = %s
                """, [tender_id])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                batch_list = [OrderedDict(zip(columns, row)) for row in rows]
                result["RetData"][1] = batch_list

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def delete_qoute(qoute_id):
        result = {"RetType": 0, "RetMsg": "Quote deleted successfully"}

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    DELETE FROM TBLQOUTE
                    WHERE qouteid = %s
                """, [qoute_id])
        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def save_qoute(qoute_data):
        """
        Insert or update a quote depending on qouteid.
        qoute_data: dict with keys:
            qouteid, qoutedate, deliverydate, qouteamount, deliveryday,
            invitationid, tenderid, batchid, createdby, vendorid
        """
        result = {"RetType": 0, "RetMsg": "Quote saved successfully"}

        try:
            qoute_id = qoute_data.get("qouteid", 0)
            qoutedate = datetime.strptime(qoute_data.get("qoutedate"), "%Y-%m-%d").strftime("%Y.%m.%d")
            deliverydate = datetime.strptime(qoute_data.get("deliverydate"), "%Y-%m-%d").strftime("%Y.%m.%d")
            qouteamount = qoute_data.get("qouteamount")
            deliveryday = qoute_data.get("deliveryday")
            invitationid = qoute_data.get("invitationid")
            tenderid = qoute_data.get("tenderid")
            batchid = qoute_data.get("batchid")
            createdby = qoute_data.get("createdby")
            vendorid = qoute_data.get("vendorid")
            created = datetime.now().strftime("%Y.%m.%d %H:%M:%S")

            with connection.cursor() as cursor:
                if qoute_id == 0:
                    # Insert new quote
                    cursor.execute("""
                        INSERT INTO TBLQOUTE 
                        (qoutedate, qouteamount, deliveryday, invitationid, tenderid, created, createdby, vendorid, batchid, deliverydate)
                        VALUES (TO_TIMESTAMP(%s, 'YYYY.MM.DD'), %s, %s, %s, %s, %s, %s, %s, %s, TO_TIMESTAMP(%s, 'YYYY.MM.DD'))
                    """, [qoutedate, qouteamount, deliveryday, invitationid, tenderid, created, createdby, vendorid, batchid, deliverydate])
                else:
                    # Update existing quote
                    cursor.execute("""
                        UPDATE TBLQOUTE
                        SET 
                            qoutedate = TO_DATE(%s, 'YYYY.MM.DD'),
                            deliverydate = TO_DATE(%s, 'YYYY.MM.DD'),
                            qouteamount = %s,
                            deliveryday = %s,
                            invitationid = %s,
                            tenderid = %s,
                            batchid = %s
                        WHERE qouteid = %s
                    """, [qoutedate, deliverydate, qouteamount, deliveryday, invitationid, tenderid, batchid, qoute_id])

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def get_vendor_list():
        result = {"RetType": 0, "RetMsg": "Success", "vendors": []}

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        vendorid,
                        vendorname,
                        registernumber,
                        CASE WHEN isvatpayer = 1 THEN 'Yes' ELSE 'Noe' END AS isvatpayer,
                        CASE 
                            WHEN vendortypeid = 1 THEN 'ААН'
                            WHEN vendortypeid = 2 THEN 'Хувь хүн'
                            ELSE 'Гадаад'
                        END AS vendortype,
                        countryname,
                        establisheddate,
                        activity,
                        CASE 
                            WHEN vendorstatusid = 1 THEN 'Идэвхитэй'
                            ELSE 'Идэвхигүй'
                        END AS vendorstatus,
                        address,
                        vendorphone,
                        vendoremail,
                        bankname,
                        bankaccountname,
                        bankaccountnumber,
                        empname,
                        empphone,
                        empemail
                    FROM TBLVENDOR
                """)

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                result["vendors"] = [OrderedDict(zip(columns, row)) for row in rows]

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def get_vendor_by_id(vendor_id):
        result = {"RetType": 0, "RetMsg": "Success", "vendor": []}

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        vendorid,
                        vendorname,
                        registernumber,
                        CASE WHEN isvatpayer = 1 THEN 'Yes' ELSE 'Noe' END AS isvatpayer,
                        CASE 
                            WHEN vendortypeid = 1 THEN 'ААН'
                            WHEN vendortypeid = 2 THEN 'Хувь хүн'
                            ELSE 'Гадаад'
                        END AS vendortype,
                        countryname,
                        establisheddate,
                        activity,
                        CASE 
                            WHEN vendorstatusid = 1 THEN 'Идэвхитэй'
                            ELSE 'Идэвхигүй'
                        END AS vendorstatus,
                        address,
                        vendorphone,
                        vendoremail,
                        bankname,
                        bankaccountname,
                        bankaccountnumber,
                        empname,
                        empphone,
                        empemail
                    FROM TBLVENDOR
                    WHERE vendorid = %s
                """, [vendor_id])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                result["vendor"] = [OrderedDict(zip(columns, row)) for row in rows]

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def get_vendor_updated():
        result = {"RetType": 0, "RetMsg": "Success", "vendors": []}

        try:
            today = datetime.now().date()
            start_datetime = datetime.combine(today, datetime.min.time())
            end_datetime = datetime.combine(today, datetime.max.time())

            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        vendorid,
                        vendorname,
                        registernumber,
                        CASE WHEN isvatpayer = 1 THEN 'Yes' ELSE 'Noe' END AS isvatpayer,
                        CASE 
                            WHEN vendortypeid = 1 THEN 'ААН'
                            WHEN vendortypeid = 2 THEN 'Хувь хүн'
                            ELSE 'Гадаад'
                        END AS vendortype,
                        countryname,
                        establisheddate,
                        activity,
                        CASE 
                            WHEN vendorstatusid = 1 THEN 'Идэвхитэй'
                            ELSE 'Идэвхигүй'
                        END AS vendorstatus,
                        address,
                        vendorphone,
                        vendoremail,
                        bankname,
                        bankaccountname,
                        bankaccountnumber,
                        empname,
                        empphone,
                        empemail
                    FROM TBLVENDOR
                    WHERE TO_TIMESTAMP(NULLIF(BTRIM(updated), ''), 'YYYY.MM.DD HH24:MI:SS')
                          BETWEEN %s AND %s
                """, [start_datetime, end_datetime])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                result["vendors"] = [OrderedDict(zip(columns, row)) for row in rows]

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def get_tender_type_list():
        result = {"RetType": 0, "RetMsg": "Success", "tender_types": []}

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM TBLTENDERTYPE")
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                result["tender_types"] = [OrderedDict(zip(columns, row)) for row in rows]

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def save_tender_type(tender_types):
        result = {"RetType": 0, "RetMsg": "Tender types saved successfully"}

        try:
            with connection.cursor() as cursor:
                for row in tender_types:
                    tendertypeid = row.get("tendertypeid", -1)
                    tendertypename = row.get("tendertypename")

                    if tendertypeid < 0:
                        # Insert new tender type
                        cursor.execute(
                            "INSERT INTO TBLTENDERTYPE (tendertypename) VALUES (%s)",
                            [tendertypename]
                        )
                    else:
                        # Update existing tender type
                        cursor.execute(
                            "UPDATE TBLTENDERTYPE SET tendertypename = %s WHERE tendertypeid = %s",
                            [tendertypename, tendertypeid]
                        )

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def delete_tender_type(tendertypeid):
        result = {"RetType": 0, "RetMsg": "Tender type deleted successfully"}

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM TBLTENDERTYPE WHERE tendertypeid = %s",
                    [tendertypeid]
                )

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def get_department_list():
        result = {"RetType": 0, "RetMsg": "Success", "departments": []}

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM TBLDEPARTMENT")
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                result["departments"] = [OrderedDict(zip(columns, row)) for row in rows]

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result
    
    def save_department(departments):
        result = {"RetType": 0, "RetMsg": "Departments saved successfully"}

        try:
            with connection.cursor() as cursor:
                for row in departments:
                    departmentid = row.get("departmentid", -1)
                    departmentname = row.get("departmentname")
                    depcode = row.get("depcode")

                    if departmentid < 0:
                        # Insert new department
                        cursor.execute(
                            "INSERT INTO TBLDEPARTMENT (departmentname, depcode) VALUES (%s, %s)",
                            [departmentname, depcode]
                        )
                    else:
                        # Update existing department
                        cursor.execute(
                            "UPDATE TBLDEPARTMENT SET departmentname = %s, depcode = %s WHERE departmentid = %s",
                            [departmentname, depcode, departmentid]
                        )

        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)

        return result

    def delete_department(department_id: int) -> dict:
        result = {"ret_type": 0, "ret_msg": "Success"}
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM TBLDEPARTMENT WHERE departmentid = %s",
                    [department_id]
                )
                if cursor.rowcount == 0:
                    result["ret_type"] = 1
                    result["ret_msg"] = f"Department ID {department_id} not found."
        except Exception as ex:
            # You can implement a proper logging function here
            print(f"Error in delete_department: {ex}")
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)
        return result
    
    def get_purchase_type_list():
        result = {
            "ret_type": 0,
            "ret_msg": "success",
            "data": []
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM TBLPURCHASETYPE")

                columns = [col[0].lower() for col in cursor.description]

                for row in cursor.fetchall():
                    result["data"].append(dict(zip(columns, row)))

        except Exception as ex:
            print("get_purchase_type_list error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result

    def save_purchase_type(data):
        result = {
            "ret_type": 0,
            "ret_msg": "success"
        }

        try:
            with connection.cursor() as cursor:

                for row in data:
                    purchasetypeid = row.get("purchasetypeid")
                    purchasetypename = row.get("purchasetypename")

                    if purchasetypeid < 0:
                        cursor.execute(
                            """
                            INSERT INTO TBLPURCHASETYPE (purchasetypename)
                            VALUES (%s)
                            """,
                            [purchasetypename]
                        )
                    else:
                        cursor.execute(
                            """
                            UPDATE TBLPURCHASETYPE
                            SET purchasetypename = %s
                            WHERE purchasetypeid = %s
                            """,
                            [purchasetypename, purchasetypeid]
                        )

        except Exception as ex:
            print("save_purchase_type error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def delete_purchase_type(purchasetypeid: int):
        result = {
            "ret_type": 0,
            "ret_msg": "success"
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM TBLPURCHASETYPE WHERE purchasetypeid = %s",
                    [purchasetypeid]
                )

                if cursor.rowcount == 0:
                    result["ret_type"] = 1
                    result["ret_msg"] = "Purchase type not found"

        except Exception as ex:
            print("delete_purchase_type error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_require_type_list():
        result = {
            "ret_type": 0,
            "ret_msg": "success",
            "data": []
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM TBLREQUIRETYPE")

                columns = [col[0].lower() for col in cursor.description]

                for row in cursor.fetchall():
                    result["data"].append(dict(zip(columns, row)))

        except Exception as ex:
            print("get_require_type_list error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def save_require_type(data):
        result = {
            "ret_type": 0,
            "ret_msg": "success"
        }

        try:
            with connection.cursor() as cursor:

                for row in data:
                    requirevalue = row.get("requirevalue")
                    id = row.get("id")

                    if id < 0:
                        cursor.execute(
                            """
                            INSERT INTO TBLREQUIRETYPE (requirevalue)
                            VALUES (%s)
                            """,
                            [requirevalue]
                        )
                    else:
                        cursor.execute(
                            """
                            UPDATE TBLREQUIRETYPE
                            SET requirevalue = %s
                            WHERE id = %s
                            """,
                            [requirevalue, id]
                        )

        except Exception as ex:
            print("save_require_type error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def delete_require_type(id: int):
        result = {
            "ret_type": 0,
            "ret_msg": "success"
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM TBLREQUIRETYPE WHERE id = %s",
                    [id]
                )

                if cursor.rowcount == 0:
                    result["ret_type"] = 1
                    result["ret_msg"] = "Require type not found"

        except Exception as ex:
            print("delete_require_type error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_criteria_type_list():
        result = {
            "ret_type": 0,
            "ret_msg": "success",
            "data": []
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM TBLCRITERIATYPE")

                columns = [col[0].lower() for col in cursor.description]

                for row in cursor.fetchall():
                    result["data"].append(dict(zip(columns, row)))

        except Exception as ex:
            print("get_criteria_type_list error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def save_criteria_type(data):
        result = {
            "ret_type": 0,
            "ret_msg": "success"
        }

        try:
            with connection.cursor() as cursor:

                for row in data:
                    criteriatypeid = row.get("criteriatypeid")
                    criteriatypename = row.get("criteriatypename")

                    if criteriatypeid < 0:
                        cursor.execute(
                            """
                            INSERT INTO TBLCRITERIATYPE (criteriatypename)
                            VALUES (%s)
                            """,
                            [criteriatypename]
                        )
                    else:
                        cursor.execute(
                            """
                            UPDATE TBLCRITERIATYPE
                            SET criteriatypename = %s
                            WHERE criteriatypeid = %s
                            """,
                            [criteriatypename, criteriatypeid]
                        )

        except Exception as ex:
            print("save_criteria_type error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def delete_criteria_type(criteriatypeid: int):
        result = {
            "ret_type": 0,
            "ret_msg": "success"
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM TBLCRITERIATYPE WHERE criteriatypeid = %s",
                    [criteriatypeid]
                )

                if cursor.rowcount == 0:
                    result["ret_type"] = 1
                    result["ret_msg"] = "Criteria type not found"

        except Exception as ex:
            print("delete_criteria_type error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_tender_doc_type_list():
        result = {
            "ret_type": 0,
            "ret_msg": "success",
            "data": []
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM TBLTENDERDOCTYPE")

                columns = [col[0].lower() for col in cursor.description]

                for row in cursor.fetchall():
                    result["data"].append(dict(zip(columns, row)))

        except Exception as ex:
            print("get_tender_doc_type_list error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def save_tender_doc_type(data):
        result = {
            "ret_type": 0,
            "ret_msg": "success"
        }

        try:
            with connection.cursor() as cursor:
                for row in data:
                    doctypeid = row.get("doctypeid")
                    doctypename = row.get("doctypename")

                    if doctypeid < 0:
                        cursor.execute(
                            """
                            INSERT INTO TBLTENDERDOCTYPE (doctypename)
                            VALUES (%s)
                            """,
                            [doctypename]
                        )
                    else:
                        cursor.execute(
                            """
                            UPDATE TBLTENDERDOCTYPE
                            SET doctypename = %s
                            WHERE doctypeid = %s
                            """,
                            [doctypename, doctypeid]
                        )

        except Exception as ex:
            print("save_tender_doc_type error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def delete_tender_doc_type(doctypeid: int):
        result = {
            "ret_type": 0,
            "ret_msg": "success"
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM TBLTENDERDOCTYPE WHERE doctypeid = %s",
                    [doctypeid]
                )

                if cursor.rowcount == 0:
                    result["ret_type"] = 1
                    result["ret_msg"] = "Tender doc type not found"

        except Exception as ex:
            print("delete_tender_doc_type error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_member_type_list():
        result = {
            "ret_type": 0,
            "ret_msg": "success",
            "data": []
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM TBLMEMBERTYPE")

                columns = [col[0].lower() for col in cursor.description]

                for row in cursor.fetchall():
                    result["data"].append(dict(zip(columns, row)))

        except Exception as ex:
            print("get_member_type_list error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def save_member_type(data):
        result = {
            "ret_type": 0,
            "ret_msg": "success"
        }

        try:
            with connection.cursor() as cursor:

                for row in data:
                    membertypeid = row.get("membertypeid")
                    membertypename = row.get("membertypename")

                    if membertypeid < 0:
                        cursor.execute(
                            """
                            INSERT INTO TBLMEMBERTYPE (membertypename)
                            VALUES (%s)
                            """,
                            [membertypename]
                        )
                    else:
                        cursor.execute(
                            """
                            UPDATE TBLMEMBERTYPE
                            SET membertypename = %s
                            WHERE membertypeid = %s
                            """,
                            [membertypename, membertypeid]
                        )

        except Exception as ex:
            print("save_member_type error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def delete_member_type(membertypeid: int):
        result = {
            "ret_type": 0,
            "ret_msg": "success"
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM TBLMEMBERTYPE WHERE membertypeid = %s",
                    [membertypeid]
                )

                if cursor.rowcount == 0:
                    result["ret_type"] = 1
                    result["ret_msg"] = "Member type not found"

        except Exception as ex:
            print("delete_member_type error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_vendor_activity_list():
        rows = []
        result = {
            "ret_type": 0,
            "ret_msg": "success",
            "ret_data": rows,
            "data": rows,
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT activityid,BTRIM(activity) AS activity FROM TBLVENDORACTIVITY "
                    "WHERE BTRIM(COALESCE(activity, ''))<>'' ORDER BY LOWER(activity),activityid"
                )

                columns = [col[0].lower() for col in cursor.description]

                for row in cursor.fetchall():
                    rows.append(dict(zip(columns, row)))

        except Exception as ex:
            print("get_vendor_activity_list error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def save_vendor_activity(data):
        result = {
            "ret_type": 0,
            "ret_msg": "success",
            "ret_data": [],
        }

        try:
            with transaction.atomic(), connection.cursor() as cursor:

                for row in data:
                    if not isinstance(row, dict):
                        raise ValueError('Үйл ажиллагааны чиглэлийн мэдээлэл буруу байна.')
                    activityid = int(row.get("activityid", -1))
                    activity = str(row.get("activity") or '').strip()
                    if not activity:
                        raise ValueError('Үйл ажиллагааны чиглэлийн нэрийг оруулна уу.')
                    if len(activity) > 200:
                        raise ValueError('Үйл ажиллагааны чиглэлийн нэр 200 тэмдэгтээс хэтрэхгүй байна.')
                    cursor.execute(
                        '''
                        SELECT 1 FROM TBLVENDORACTIVITY
                        WHERE LOWER(BTRIM(activity))=LOWER(%s) AND activityid<>%s
                        LIMIT 1
                        ''',
                        [activity, activityid],
                    )
                    if cursor.fetchone():
                        raise ValueError('Ижил нэртэй үйл ажиллагааны чиглэл бүртгэлтэй байна.')

                    if activityid < 0:
                        cursor.execute(
                            """
                            INSERT INTO TBLVENDORACTIVITY (activity)
                            VALUES (%s)
                            RETURNING activityid
                            """,
                            [activity]
                        )
                        saved_id = cursor.fetchone()[0]
                    else:
                        cursor.execute(
                            "SELECT activity FROM TBLVENDORACTIVITY WHERE activityid=%s FOR UPDATE",
                            [activityid],
                        )
                        existing = cursor.fetchone()
                        if not existing:
                            raise ValueError('Үйл ажиллагааны чиглэл олдсонгүй.')
                        cursor.execute(
                            """
                            UPDATE TBLVENDORACTIVITY
                            SET activity = %s
                            WHERE activityid = %s
                            """,
                            [activity, activityid]
                        )
                        cursor.execute(
                            '''
                            UPDATE TBLVENDOR SET activity=%s
                            WHERE LOWER(BTRIM(COALESCE(activity, '')))=LOWER(BTRIM(%s))
                            ''',
                            [activity, existing[0]],
                        )
                        cursor.execute(
                            '''
                            UPDATE tblvendor vendor
                            SET activity=summary.activity
                            FROM (
                                SELECT relation.vendorid,
                                       STRING_AGG(master.activity, ', ' ORDER BY master.activity) activity
                                FROM vendor_activity_relation relation
                                INNER JOIN tblvendoractivity master
                                    ON master.activityid=relation.activityid
                                WHERE relation.vendorid IN (
                                    SELECT vendorid FROM vendor_activity_relation WHERE activityid=%s
                                )
                                GROUP BY relation.vendorid
                            ) summary
                            WHERE vendor.vendorid=summary.vendorid
                            ''',
                            [activityid],
                        )
                        saved_id = activityid
                    result["ret_data"].append({"activityid": saved_id, "activity": activity})

        except Exception as ex:
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)
            result["ret_data"] = []

        return result
    
    def delete_vendor_activity(activityid: int):
        result = {
            "ret_type": 0,
            "ret_msg": "success"
        }

        try:
            with transaction.atomic(), connection.cursor() as cursor:
                cursor.execute(
                    "SELECT activity FROM TBLVENDORACTIVITY WHERE activityid=%s FOR UPDATE",
                    [activityid],
                )
                existing = cursor.fetchone()
                if not existing:
                    result["ret_type"] = 1
                    result["ret_msg"] = "Үйл ажиллагааны чиглэл олдсонгүй."
                    return result
                cursor.execute(
                    "SELECT 1 FROM vendor_activity_relation WHERE activityid=%s LIMIT 1",
                    [activityid],
                )
                if cursor.fetchone():
                    result["ret_type"] = 1
                    result["ret_msg"] = "Нийлүүлэгч ашиглаж байгаа тул энэ чиглэлийг устгах боломжгүй."
                    return result
                cursor.execute(
                    '''
                    SELECT 1 FROM TBLVENDOR
                    WHERE LOWER(BTRIM(COALESCE(activity, '')))=LOWER(BTRIM(%s))
                    LIMIT 1
                    ''',
                    [existing[0]],
                )
                if cursor.fetchone():
                    result["ret_type"] = 1
                    result["ret_msg"] = "Нийлүүлэгч ашиглаж байгаа тул энэ чиглэлийг устгах боломжгүй."
                    return result
                cursor.execute(
                    "SELECT 1 FROM TBLTENDER WHERE activityid=%s LIMIT 1",
                    [activityid],
                )
                if cursor.fetchone():
                    result["ret_type"] = 1
                    result["ret_msg"] = "Тендер ашиглаж байгаа тул энэ чиглэлийг устгах боломжгүй."
                    return result
                cursor.execute(
                    "SELECT 1 FROM tender_activity_relation WHERE activityid=%s LIMIT 1",
                    [activityid],
                )
                if cursor.fetchone():
                    result["ret_type"] = 1
                    result["ret_msg"] = "Тендер ашиглаж байгаа тул энэ чиглэлийг устгах боломжгүй."
                    return result
                cursor.execute(
                    "DELETE FROM TBLVENDORACTIVITY WHERE activityid = %s",
                    [activityid]
                )

        except Exception as ex:
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_vendor_sub_activity_list():
        result = {
            "ret_type": 0,
            "ret_msg": "success",
            "data": []
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM TBLVENDORSUBACTIVITY")

                columns = [col[0].lower() for col in cursor.description]

                for row in cursor.fetchall():
                    result["data"].append(dict(zip(columns, row)))

        except Exception as ex:
            print("get_vendor_sub_activity_list error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def save_vendor_sub_activity(data):
        result = {
            "ret_type": 0,
            "ret_msg": "success"
        }

        try:
            with connection.cursor() as cursor:

                for row in data:
                    subactivityid = row.get("subactivityid")
                    activityid = row.get("activityid")
                    subactivity = row.get("subactivity")

                    if subactivityid < 0:
                        cursor.execute(
                            """
                            INSERT INTO TBLVENDORSUBACTIVITY (activityid, subactivity)
                            VALUES (%s, %s)
                            """,
                            [activityid, subactivity]
                        )
                    else:
                        cursor.execute(
                            """
                            UPDATE TBLVENDORSUBACTIVITY
                            SET activityid = %s,
                                subactivity = %s
                            WHERE subactivityid = %s
                            """,
                            [activityid, subactivity, subactivityid]
                        )

        except Exception as ex:
            print("save_vendor_sub_activity error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def delete_vendor_sub_activity(subactivityid: int):
        result = {
            "ret_type": 0,
            "ret_msg": "success"
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM TBLVENDORSUBACTIVITY WHERE subactivityid = %s",
                    [subactivityid]
                )

                if cursor.rowcount == 0:
                    result["ret_type"] = 1
                    result["ret_msg"] = "Vendor sub-activity not found"

        except Exception as ex:
            print("delete_vendor_sub_activity error:", ex)
            result["ret_type"] = 1
            result["ret_msg"] = str(ex)

        return result
    
    def get_email_cc_list():
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM TBLEMAILCC")
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                result = [dict(zip(columns, row)) for row in rows]
            return {"RetType": 0, "RetMsg": "Success", "Data": result}
        except Exception as e:
            print(f"Error in get_email_cc_list: {e}")
            return {"RetType": 1, "RetMsg": str(e), "Data": []}
        
    def save_email_cc(data_list):
        try:
            with connection.cursor() as cursor:
                for row in data_list:
                    if row.get('id', -1) < 0:
                        # Insert new record
                        cursor.execute("""
                            INSERT INTO TBLEMAILCC (empname, positionname, email)
                            VALUES (%s, %s, %s)
                        """, [row['empname'], row['positionname'], row['email']])
                    else:
                        # Update existing record
                        cursor.execute("""
                            UPDATE TBLEMAILCC
                            SET empname = %s, positionname = %s, email = %s
                            WHERE id = %s
                        """, [row['empname'], row['positionname'], row['email'], row['id']])
            return {"RetType": 0, "RetMsg": "Success"}
        except Exception as e:
            print(f"Error in save_email_cc: {e}")
            return {"RetType": 1, "RetMsg": str(e)}
    
    def delete_email_cc(email_id):
        try:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM TBLEMAILCC WHERE id = %s", [email_id])
            return {"RetType": 0, "RetMsg": "Success"}
        except Exception as e:
            print(f"Error in delete_email_cc: {e}")
            return {"RetType": 1, "RetMsg": str(e)}

    def get_code_list():
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM TBLCODE")
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                result = [dict(zip(columns, row)) for row in rows]
            return {"RetType": 0, "RetMsg": "Success", "Data": result}
        except Exception as e:
            print(f"Error in get_code_list: {e}")
            return {"RetType": 1, "RetMsg": str(e), "Data": []}
        
    def save_code(data_list):
        try:
            with connection.cursor() as cursor:
                for row in data_list:
                    if row.get('id', -1) < 0:
                        # Insert new record
                        cursor.execute("""
                            INSERT INTO TBLCODE (codetypeid, tendertypeid, newnumber)
                            VALUES (%s, %s, %s)
                        """, [row['codetypeid'], row['tendertypeid'], row['newnumber']])
                    else:
                        # Update existing record
                        cursor.execute("""
                            UPDATE TBLCODE
                            SET codetypeid = %s, tendertypeid = %s, newnumber = %s
                            WHERE id = %s
                        """, [row['codetypeid'], row['tendertypeid'], row['newnumber'], row['id']])
            return {"RetType": 0, "RetMsg": "Success"}
        except Exception as e:
            print(f"Error in save_code: {e}")
            return {"RetType": 1, "RetMsg": str(e)}
        
    def delete_code(code_id):
        try:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM TBLCODE WHERE id = %s", [code_id])
            return {"RetType": 0, "RetMsg": "Success"}
        except Exception as e:
            print(f"Error in delete_code: {e}")
            return {"RetType": 1, "RetMsg": str(e)}
    
    def get_permission(empid):
        permission = {
            "empid": empid,
            "isTenderManage": 0,
            "isCommitteeManage": 0,
            "isTenderEvaluate": 0,
            "isTenderApprove": 0,
            "isTenderCancel": 0,
            "isAdmin": 0
        }

        try:
            sql_base = """
                SELECT COUNT(*) 
                FROM TBLSETTINGS
                LEFT JOIN TBLACTION ON TBLACTION.id = TBLSETTINGS.actionid
                WHERE actioncode = %s AND empid = %s
            """

            actions = PERMISSION_ACTION_CODES
            flags = [
                'isTenderManage',
                'isCommitteeManage',
                'isTenderEvaluate',
                'isTenderApprove',
                'isTenderCancel',
            ]

            with connection.cursor() as cursor:
                for action, flag in zip(actions, flags):
                    cursor.execute(sql_base, [action, empid])
                    count = cursor.fetchone()[0]
                    permission[flag] = 1 if count > 0 else 0

                # Check admin
                cursor.execute("SELECT COUNT(*) FROM TBLADMIN WHERE empid = %s", [empid])
                count = cursor.fetchone()[0]
                permission['isAdmin'] = 1 if count > 0 else 0

            return {"RetType": 0, "RetMsg": "Success", "RetData": permission}

        except Exception as e:
            print(f"Error in get_permission: {e}")
            return {"RetType": 1, "RetMsg": str(e), "RetData": permission}
        
    def get_settings():
        rData = [[], [], [], []]

        try:
            with connection.cursor() as cursor:
                # 1. TBLSETTINGS joined with action, membertype, emp
                cursor.execute("""
                    SELECT 
                        TBLSETTINGS.id, TBLSETTINGS.actionid, TBLACTION.actioncode, TBLACTION.actionname,
                        TBLSETTINGS.membertypeid, TBLMEMBERTYPE.membertypename,
                        TBLSETTINGS.empid, TBLEMP.empname, TBLEMP.email
                    FROM TBLSETTINGS
                    LEFT JOIN TBLMEMBERTYPE ON TBLMEMBERTYPE.membertypeid = TBLSETTINGS.membertypeid
                    LEFT JOIN TBLEMP ON TBLEMP.empid = TBLSETTINGS.empid
                    LEFT JOIN TBLACTION ON TBLACTION.id = TBLSETTINGS.actionid
                    WHERE TBLACTION.actioncode IN ('TenderEdit', 'Committee', 'Evaluate', 'Publish', 'Cancel')
                    ORDER BY TBLSETTINGS.id DESC
                """)
                columns = [col[0] for col in cursor.description]
                rData[0] = [dict(zip(columns, row)) for row in cursor.fetchall()]

                # 2. TBLACTION
                cursor.execute("""
                    SELECT *
                    FROM TBLACTION
                    WHERE actioncode IN ('TenderEdit', 'Committee', 'Evaluate', 'Publish', 'Cancel')
                    ORDER BY CASE actioncode
                        WHEN 'TenderEdit' THEN 1
                        WHEN 'Committee' THEN 2
                        WHEN 'Evaluate' THEN 3
                        WHEN 'Publish' THEN 4
                        WHEN 'Cancel' THEN 5
                    END
                """)
                columns = [col[0] for col in cursor.description]
                rData[1] = [dict(zip(columns, row)) for row in cursor.fetchall()]

                # 3. TBLMEMBERTYPE
                cursor.execute("SELECT * FROM TBLMEMBERTYPE")
                columns = [col[0] for col in cursor.description]
                rData[2] = [dict(zip(columns, row)) for row in cursor.fetchall()]

                # 4. Employees who already have an employee account in tender.
                # TBLEMP is the full ERP directory, so it must not be exposed as
                # the permission-assignment picker.
                cursor.execute("""
                    WITH registered_employees AS (
                        SELECT
                            userid,
                            empid,
                            username,
                            empname,
                            positionname,
                            ROW_NUMBER() OVER (PARTITION BY empid ORDER BY userid) AS row_number
                        FROM TBLTENDERUSER
                        WHERE empid IS NOT NULL
                            AND empid > 0
                            AND COALESCE(vendorid, 0) <= 0
                    )
                    SELECT
                        registered.userid AS id,
                        registered.empid,
                        COALESCE(
                            NULLIF(BTRIM(TBLEMP.empname), ''),
                            NULLIF(BTRIM(registered.empname), ''),
                            registered.username
                        ) AS empname,
                        COALESCE(
                            NULLIF(BTRIM(TBLEMP.positionname), ''),
                            NULLIF(BTRIM(registered.positionname), '')
                        ) AS positionname,
                        COALESCE(
                            NULLIF(BTRIM(TBLEMP.email), ''),
                            registered.username
                        ) AS email
                    FROM registered_employees registered
                    LEFT JOIN TBLEMP ON TBLEMP.empid = registered.empid
                    WHERE registered.row_number = 1
                    ORDER BY LOWER(COALESCE(TBLEMP.empname, registered.empname, registered.username))
                """)
                columns = [col[0] for col in cursor.description]
                rData[3] = [dict(zip(columns, row)) for row in cursor.fetchall()]

            return {"RetType": 0, "RetMsg": "Success", "RetData": rData}

        except Exception as e:
            print(f"Error in get_settings: {e}")
            return {"RetType": 1, "RetMsg": str(e), "RetData": rData}
        
    def save_settings(data_list):
        if isinstance(data_list, dict):
            return TenderService.replace_employee_settings(data_list)

        try:
            with transaction.atomic(), connection.cursor() as cursor:
                for row in data_list:
                    row_id = row.get('id', -1)
                    member_type_id = row.get('membertypeid')
                    cursor.execute("""
                        SELECT 1
                        FROM TBLTENDERUSER
                        WHERE empid = %s
                            AND empid > 0
                            AND COALESCE(vendorid, 0) <= 0
                        LIMIT 1
                    """, [row['empid']])
                    if cursor.fetchone() is None:
                        raise ValueError(
                            "Tender системд ажилтнаар бүртгэлтэй хэрэглэгч сонгоно уу."
                        )
                    cursor.execute("""
                        SELECT 1
                        FROM TBLACTION
                        WHERE id = %s
                            AND actioncode IN ('TenderEdit', 'Committee', 'Evaluate', 'Publish', 'Cancel')
                    """, [row['actionid']])
                    if cursor.fetchone() is None:
                        raise ValueError("Системд ашиглагддаг эрхийн үйлдэл сонгоно уу.")
                    cursor.execute("""
                        SELECT 1
                        FROM TBLSETTINGS
                        WHERE actionid = %s
                            AND empid = %s
                            AND (%s < 0 OR id <> %s)
                        LIMIT 1
                    """, [row['actionid'], row['empid'], row_id, row_id])
                    if cursor.fetchone() is not None:
                        raise ValueError("Энэ үйлдлийн эрх тухайн ажилтанд бүртгэлтэй байна.")
                    if row_id < 0:
                        cursor.execute("""
                            INSERT INTO TBLSETTINGS (actionid, membertypeid, empid)
                            VALUES (%s, %s, %s)
                        """, [row['actionid'], member_type_id, row['empid']])
                    else:
                        cursor.execute("""
                            UPDATE TBLSETTINGS
                            SET empid = %s, membertypeid = %s, actionid = %s
                            WHERE id = %s
                        """, [row['empid'], member_type_id, row['actionid'], row_id])
                        if cursor.rowcount == 0:
                            raise ValueError(f"Record with id {row_id} not found")
                    # The request audit context and database trigger record the
                    # verified actor and old/new row; no client-supplied log user.
            return {"RetType": 0, "RetMsg": "Success"}
        except ValueError as e:
            return {"RetType": 1, "RetMsg": str(e)}
        except Exception as e:
            print(f"Error in save_settings: {e}")
            return {"RetType": 1, "RetMsg": str(e)}

    def replace_employee_settings(data):
        """Synchronize all supported permissions for one employee atomically."""
        try:
            employee_id = int(data.get('empid'))
            requested_action_ids = list(dict.fromkeys(int(value) for value in data.get('actionids', [])))

            with transaction.atomic(), connection.cursor() as cursor:
                cursor.execute("""
                    SELECT 1
                    FROM TBLTENDERUSER
                    WHERE empid = %s
                        AND empid > 0
                        AND COALESCE(vendorid, 0) <= 0
                    LIMIT 1
                """, [employee_id])
                if cursor.fetchone() is None:
                    raise ValueError(
                        "Tender системд ажилтнаар бүртгэлтэй хэрэглэгч сонгоно уу."
                    )

                cursor.execute("""
                    SELECT id
                    FROM TBLACTION
                    WHERE actioncode IN ('TenderEdit', 'Committee', 'Evaluate', 'Publish', 'Cancel')
                """)
                allowed_action_ids = {row[0] for row in cursor.fetchall()}
                if not set(requested_action_ids).issubset(allowed_action_ids):
                    raise ValueError("Системд ашиглагддаг эрхийн үйлдэл сонгоно уу.")

                cursor.execute("""
                    SELECT TBLSETTINGS.id, TBLSETTINGS.actionid
                    FROM TBLSETTINGS
                    INNER JOIN TBLACTION ON TBLACTION.id = TBLSETTINGS.actionid
                    WHERE TBLSETTINGS.empid = %s
                        AND TBLACTION.actioncode IN ('TenderEdit', 'Committee', 'Evaluate', 'Publish', 'Cancel')
                    ORDER BY TBLSETTINGS.id
                    FOR UPDATE
                """, [employee_id])
                existing_by_action = {}
                for setting_id, action_id in cursor.fetchall():
                    existing_by_action.setdefault(action_id, []).append(setting_id)

                requested_set = set(requested_action_ids)
                delete_ids = []
                for action_id, setting_ids in existing_by_action.items():
                    if action_id not in requested_set:
                        delete_ids.extend(setting_ids)
                    else:
                        delete_ids.extend(setting_ids[1:])

                if delete_ids:
                    placeholders = ', '.join(['%s'] * len(delete_ids))
                    cursor.execute(
                        f"DELETE FROM TBLSETTINGS WHERE id IN ({placeholders})",
                        delete_ids,
                    )

                for action_id in requested_action_ids:
                    if action_id not in existing_by_action:
                        cursor.execute("""
                            INSERT INTO TBLSETTINGS (actionid, membertypeid, empid)
                            VALUES (%s, NULL, %s)
                        """, [action_id, employee_id])

            return {
                "RetType": 0,
                "RetMsg": "Success",
                "RetData": {"empid": employee_id, "actionids": requested_action_ids},
            }
        except (TypeError, ValueError) as e:
            return {"RetType": 1, "RetMsg": str(e)}
        except Exception as e:
            print(f"Error in replace_employee_settings: {e}")
            return {"RetType": 1, "RetMsg": str(e)}

    def delete_setting(setting_id):
        try:
            with transaction.atomic(), connection.cursor() as cursor:
                cursor.execute("DELETE FROM TBLSETTINGS WHERE id = %s", [setting_id])
                if cursor.rowcount == 0:
                    return {"RetType": 1, "RetMsg": f"Record with id {setting_id} not found"}

            return {"RetType": 0, "RetMsg": "Success"}
        except Exception as e:
            print(f"Error in delete_setting: {e}")
            return {"RetType": 1, "RetMsg": str(e)}
        
    def tender_open_log(empid, invitationid):
        result = {"RetType": 0, "RetMsg": "Success", "RetData": 0}

        try:
            with connection.cursor() as cursor:
                # Check if evaluation committee exists for this invitation (roles 1,2,4)
                cursor.execute("""
                    SELECT COUNT(*) FROM TBLEVALUATION
                    WHERE invitationid = %s AND roleid IN (1,2,4)
                """, [invitationid])
                total_eval = cursor.fetchone()[0]
                if total_eval == 0:
                    return {
                        "RetType": -1,
                        "RetMsg": "Үнэлгээний хороонд тендер нээх эрх бүхий гишүүд бүрэн тохируулагдаагүй байна. Үнэлгээний хороонд Дарга, Нарийн бичиг, Дотоод хяналт гэсэн үүрэгтэй гишүүд заавал байхыг анхаарна уу!"
                    }

                # Check if empid is part of evaluation committee
                cursor.execute("""
                    SELECT roleid FROM TBLEVALUATION 
                    WHERE invitationid = %s AND empid = %s
                """, [invitationid, empid])
                row = cursor.fetchone()
                if not row:
                    return {"RetType": -1, "RetMsg": "Уучлаарай тендер нээх эрх зөвшөөрөгдөөгүй байна."}

                membertypeid = row[0]
                if membertypeid not in [1, 2, 4]:
                    return {"RetType": -1, "RetMsg": "Уучлаарай тендер нээх эрх зөвшөөрөгдөөгүй байна."}

                # Check if this emp already opened the tender
                cursor.execute("""
                    SELECT COUNT(*) FROM TBLTENDEROPEN
                    WHERE invitationid = %s AND empid = %s AND membertypeid = %s
                """, [invitationid, empid, membertypeid])
                current_emp_log = cursor.fetchone()[0]
                if current_emp_log > 0:
                    return {"RetType": -1, "RetMsg": "Тендер нээх үйлдлийг хийсэн байна !!"}

                # Count total tender opens so far
                cursor.execute("""
                    SELECT COUNT(*) FROM TBLTENDEROPEN
                    WHERE invitationid = %s
                """, [invitationid])
                total_tender_open = cursor.fetchone()[0]

                # Check action sequence rules
                flag_check = False
                if membertypeid == 2 and total_tender_open == 0:
                    flag_check = True
                elif membertypeid == 1 and total_tender_open == 1:
                    flag_check = True
                elif membertypeid == 4 and total_tender_open == 2:
                    flag_check = True

                if not flag_check:
                    return {
                        "RetType": -1,
                        "RetMsg": "Тендер нээх үйлдлийн дараалал буруу байна! 1.Нарийн бичиг  2.Дарга  3.Дотоод хяналт гэсэн дарааллаар явахыг анхаарна уу !!"
                    }

                # Check if tender already opened by this role
                cursor.execute("""
                    SELECT COUNT(*) FROM TBLTENDEROPEN
                    WHERE invitationid = %s AND membertypeid = %s
                """, [invitationid, membertypeid])
                role_opened = cursor.fetchone()[0]

                if role_opened == 0:
                    # Insert tender open record
                    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    cursor.execute("""
                        INSERT INTO TBLTENDEROPEN (empid, invitationid, membertypeid, created)
                        VALUES (%s, %s, %s, %s)
                    """, [empid, invitationid, membertypeid, now_str])
                    total_tender_open += 1

                # If total tender opens == 3, tender fully opened
                if total_tender_open == 3:
                    result["RetData"] = 1
                else:
                    result["RetData"] = 0

            return result

        except Exception as e:
            print(f"Error in tender_open_log: {e}")
            return {"RetType": 1, "RetMsg": str(e), "RetData": 0}
    
    def get_vendor_category(url: str) -> dict:
        """
        Fetch vendor categories from ERP using an ERP session.
        
        Args:
            url (str): ERP base URL
        
        Returns:
            dict: {"RetType": 0/1/-1, "RetMsg": "...", "RetData": [...]}
        """
        result = {"RetType": 0, "RetMsg": "Success", "RetData": []}

        try:
            session_id = obtain_erp_session(url)
            if not session_id:
                return {"RetType": 1, "RetMsg": "Failed to obtain ERP session", "RetData": []}

            headers = {
                "Content-Type": "application/json; charset=UTF-8",
                "Cookie": f"session_id={session_id}"
            }

            payload = {
                "jsonrpc": "2.0",
                "params": {}
            }

            response = requests.post(f"{url}/get_partner_categories", json=payload, headers=headers, verify=False)
            if response.status_code == 200:
                data = response.json()
                if str(data.get("result", {}).get("status")) == "1":
                    result["RetData"] = data["result"]["response"]
                else:
                    result["RetType"] = -1
                    result["RetMsg"] = "ERP returned status != 1"
            else:
                result["RetType"] = -1
                result["RetMsg"] = f"HTTP error {response.status_code}"

        except Exception as e:
            print(f"Error in get_vendor_category: {e}")
            result["RetType"] = 1
            result["RetMsg"] = str(e)

        return result
    
    def get_tender_open_log(invitationid: int) -> dict:
        result = {"RetType": 0, "RetMsg": "Success", "RetData": []}

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT tm.membertypename, tto.created
                    FROM TBLTENDEROPEN tto
                    INNER JOIN TBLMEMBERTYPE tm ON tto.membertypeid = tm.membertypeid
                    WHERE tto.invitationid = %s
                """, [invitationid])
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                result["RetData"] = [dict(zip(columns, row)) for row in rows]

        except Exception as e:
            print(f"Error in get_tender_open_log: {e}")
            result["RetType"] = 1
            result["RetMsg"] = str(e)

        return result
    
    def get_members(invitationid: int, base_url: str) -> dict:
        """
        Get evaluation members for a given invitation ID.
        Images are returned as full URLs based on base_url.

        Args:
            invitationid (int): Invitation ID
            base_url (str): Base URL to prefix image paths

        Returns:
            dict: {"RetType": 0/1, "RetMsg": "...", "RetData": [...]}
        """
        result = {"RetType": 0, "RetMsg": "Success", "RetData": []}

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT e.evaluationid, emp.empid, emp.empname, emp.positionname,
                        emp.image, mt.membertypeid, mt.membertypename
                    FROM TBLEVALUATION e
                    INNER JOIN TBLMEMBERTYPE mt ON mt.membertypeid = e.roleid
                    INNER JOIN TBLEMP emp ON emp.empid = e.empid
                    WHERE e.invitationid = %s
                """, [invitationid])
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                
                members = []
                for row in rows:
                    member = dict(zip(columns, row))
                    # Build full image URL if image path exists
                    if member.get("image"):
                        member["image"] = f"{base_url}{member['image']}"
                    members.append(member)
                
                result["RetData"] = members

        except Exception as e:
            print(f"Error in get_members: {e}")
            result["RetType"] = 1
            result["RetMsg"] = str(e)

        return result
    
    def get_member_by_id(evaluationid: int) -> dict:
        result = {"RetType": 0, "RetMsg": "Success", "RetData": {}}

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT e.evaluationid, emp.empid, emp.empname, emp.positionname,
                        emp.image, mt.membertypeid, mt.membertypename
                    FROM TBLEVALUATION e
                    INNER JOIN TBLMEMBERTYPE mt ON mt.membertypeid = e.roleid
                    INNER JOIN TBLEMP emp ON emp.empid = e.empid
                    WHERE e.evaluationid = %s
                """, [evaluationid])
                
                row = cursor.fetchone()
                if row:
                    columns = [col[0] for col in cursor.description]
                    member = dict(zip(columns, row))
                    result["RetData"] = member
                else:
                    result["RetType"] = -1
                    result["RetMsg"] = f"No member found with evaluationid {evaluationid}"

        except Exception as e:
            print(f"Error in get_member_by_id: {e}")
            result["RetType"] = 1
            result["RetMsg"] = str(e)

        return result

    def delete_member(evaluationid: int) -> dict:
        result = {"RetType": 0, "RetMsg": "Success", "RetData": {}}

        try:
            with connection.cursor() as cursor:
                # Get invitationid and empid of this evaluation
                cursor.execute("""
                    SELECT invitationid, empid 
                    FROM TBLEVALUATION
                    WHERE evaluationid = %s
                """, [evaluationid])
                row = cursor.fetchone()
                if not row:
                    result["RetType"] = -1
                    result["RetMsg"] = f"No evaluation found with id {evaluationid}"
                    return result
                
                invitationid, empid = row

                # Check if this member has already opened the tender
                cursor.execute("""
                    SELECT id FROM TBLTENDEROPEN
                    WHERE empid = %s AND invitationid = %s
                """, [empid, invitationid])
                tender_rows = cursor.fetchall()
                if tender_rows:
                    result["RetType"] = -1
                    result["RetMsg"] = "Тендер нээх үйлдэл хийсэн үнэлгээний хорооны гишүүн тул устгах боломжгүй!!"
                    return result

                # Safe to delete
                cursor.execute("""
                    DELETE FROM TBLEVALUATION WHERE evaluationid = %s
                """, [evaluationid])

        except Exception as e:
            print(f"Error in delete_member: {e}")
            result["RetType"] = 1
            result["RetMsg"] = str(e)

        return result
    
    def save_members(member_list):
        try:
            with connection.cursor() as cursor:
                for r in member_list:
                    if r.get("evaluationid", 0) == 0:
                        # Insert
                        cursor.execute("""
                            INSERT INTO TBLEVALUATION 
                            (invitationid, empid, empname, positionname, roleid, createdby, email, image)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """, [
                            r["invitationid"], r["empid"], r["empname"], r["positionname"],
                            r["membertypeid"], r["createdby"], r["email"], r["image"]
                        ])
                    else:
                        # Update
                        cursor.execute("""
                            UPDATE TBLEVALUATION
                            SET invitationid=%s, empid=%s, empname=%s, positionname=%s,
                                roleid=%s, createdby=%s, email=%s
                            WHERE evaluationid=%s
                        """, [
                            r["invitationid"], r["empid"], r["empname"], r["positionname"],
                            r["membertypeid"], r["createdby"], r["email"], r["evaluationid"]
                        ])
                    
                    # Get CC emails
                    cursor.execute("SELECT email FROM TBLEMAILCC")
                    cc_emails = [row[0] for row in cursor.fetchall()]
                    
                    # Add member email
                    cc_emails.append(r["email"])
                    
                    # Email content
                    subject = "Тендерийн Үнэлгээний хорооны гишүүнээр нэмэгдлээ."
                    body = (
                        f"Сайн байна уу. <br/><br/> Эрхэм {r['empname']} та "
                        f"<b>'{r['tendername']}'</b> тендерийн урилгын үнэлгээний хороонд "
                        f"<b>'{r['membertypename']}'</b> үүргээр нэмэгдлээ."
                    )
                    
                    # Send the committee assignment email from the configured account.
                    send_mail(
                        subject=subject,
                        message='',
                        from_email=settings.DEFAULT_FROM_EMAIL,
                        recipient_list=cc_emails,
                        html_message=body,
                        fail_silently=True
                    )
            return {"ret_type": 0, "ret_msg": "Success"}
        except Exception as e:
            # Log error
            print(f"Error in save_members: {str(e)}")
            return {"ret_type": 1, "ret_msg": str(e)}
        
    def get_emp_list(param):
        result = {"ret_type": 0, "ret_msg": "", "ret_data": None}
        try:
            headers = {
                "Content-Type": "application/json; charset=UTF-8",
                "Cookie": f"session_id={param['session_id']}"
            }
            payload = {
                "jsonrpc": "2.0",
                "params": {
                    "limit": param.get("limit", 10),
                    "page": param.get("page", 1)
                }
            }
            response = requests.post(f"{param['url']}/getEmployeeList", json=payload, headers=headers, verify=False)

            if response.status_code == 200:
                data = response.json()
                if data.get("result", {}).get("status") == "True":
                    employees = data["result"]["response"]
                    result["ret_data"] = employees

                    with connection.cursor() as cursor:
                        for emp in employees:
                            # Check if employee exists
                            cursor.execute("SELECT COUNT(*) FROM TBLEMP WHERE empid=%s", [emp["employeeid"]])
                            exists = cursor.fetchone()[0]

                            if exists == 0:
                                # Insert new employee
                                cursor.execute("""
                                    INSERT INTO TBLEMP (empid, empname, positionname, email, image)
                                    VALUES (%s, %s, %s, %s, %s)
                                """, [
                                    emp["employeeid"],
                                    emp["employeeName"],
                                    emp["positionname"],
                                    emp["email"],
                                    emp["image"]
                                ])
                            else:
                                # Update existing employee
                                cursor.execute("""
                                    UPDATE TBLEMP
                                    SET positionname=%s, image=%s
                                    WHERE empid=%s
                                """, [
                                    emp["positionname"],
                                    emp["image"],
                                    emp["employeeid"]
                                ])
                else:
                    result["ret_type"] = -1
            else:
                result["ret_type"] = -1
                result["ret_msg"] = f"HTTP Error: {response.status_code}"

        except Exception as e:
            print(f"Error in get_emp_list: {e}")
            result["ret_type"] = 1
            result["ret_msg"] = str(e)

        return result
    
    def get_vendor_notifications(vendor_id):
        """Return tender activity derived from persisted invitation and participation rows."""
        result = {"ret_type": 0, "ret_msg": "", "ret_data": []}
        try:
            vendor_id = int(vendor_id or 0)
            if vendor_id <= 0:
                raise ValueError("vendorid is required")
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT
                        i.invitationid,
                        i.invitationcode,
                        t.tenderid,
                        t.tendercode,
                        t.tendername,
                        i.status,
                        s.name AS statusname,
                        TO_CHAR(t.publishdate, 'YYYY.MM.DD HH24:MI') AS publishdate,
                        TO_CHAR(i.acceptdate, 'YYYY.MM.DD HH24:MI') AS acceptdate,
                        TO_CHAR(i.opendate, 'YYYY.MM.DD HH24:MI') AS opendate,
                        i.acceptdate::date - CURRENT_DATE AS balanceday,
                        CASE WHEN p.invitationid IS NULL THEN 0 ELSE 1 END AS participated,
                        COALESCE(p.selected, 0) AS selected,
                        p.joineddate
                    FROM TBLINVITATION i
                    INNER JOIN TBLTENDER t ON t.tenderid = i.tenderid
                    LEFT JOIN TBLINVITATIONSTATUS s ON s.status = i.status
                    LEFT JOIN (
                        SELECT invitationid,
                            MAX(CASE WHEN status = 5 THEN 1 ELSE 0 END) AS selected,
                            MAX(created) AS joineddate
                        FROM TBLINVITATIONOFVENDOR
                        WHERE vendorid = %s
                        GROUP BY invitationid
                    ) p ON p.invitationid = i.invitationid
                    WHERE p.invitationid IS NOT NULL
                       OR (
                            i.status=1
                            AND EXISTS (
                                SELECT 1
                                FROM tender_activity_relation tender_activity
                                INNER JOIN vendor_activity_relation vendor_activity
                                    ON vendor_activity.activityid=tender_activity.activityid
                                WHERE tender_activity.tenderid=t.tenderid
                                  AND vendor_activity.vendorid=%s
                            )
                       )
                    ORDER BY i.invitationid DESC
                    LIMIT 50
                """, [vendor_id, vendor_id])
                columns = [column[0] for column in cursor.description]
                result["ret_data"] = [dict(zip(columns, row)) for row in cursor.fetchall()]
        except Exception as exc:
            result["ret_type"] = 1
            result["ret_msg"] = str(exc)
        return result

    def get_employees():
        """
        Retrieve all employees from TBLEMP table.
        """
        result = {"ret_type": 0, "ret_msg": "", "ret_data": []}
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT empid, empname, positionname, email, image FROM TBLEMP")
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                employees = [dict(zip(columns, row)) for row in rows]
                result["ret_data"] = employees
        except Exception as e:
            print(f"Error in get_employees: {e}")
            result["ret_type"] = 1
            result["ret_msg"] = str(e)
        return result
    
    def get_log_record_list():
        """
        Retrieve all log records from TBLLOGRECORD ordered by logdate.
        """
        result = {"ret_type": 0, "ret_msg": "", "ret_data": []}
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT logid, actionname, logdate, empid, loguser
                    FROM TBLLOGRECORD
                    ORDER BY logdate
                """)
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                logs = [dict(zip(columns, row)) for row in rows]
                result["ret_data"] = logs
        except Exception as e:
            print(f"Error in get_log_record_list: {e}")
            result["ret_type"] = 1
            result["ret_msg"] = str(e)
        return result
    
    def get_vendor_company_doc_list(vendorid):
        """
        Retrieve all company documents for a specific vendor.
        """
        result = {"ret_type": 0, "ret_msg": "", "ret_data": []}
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT v.vendordocid, v.documentname, v.filename, v.sourceid, v.sourcetype,
                        v.filetype, v.filepath, v.created, v.createdby
                    FROM TBLVENDORDOC v
                    INNER JOIN TBLFILES f ON f.sourceid = v.vendordocid AND f.sourcetype = 'VendorCompanyDoc'
                    WHERE v.vendorid = %s
                """, [vendorid])
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                docs = [dict(zip(columns, row)) for row in rows]
                result["ret_data"] = docs
        except Exception as e:
            print(f"Error in get_vendor_company_doc_list: {e}")
            result["ret_type"] = 1
            result["ret_msg"] = str(e)
        return result
    
    def change_password_to_salt():
        result = {"ret_type": 0, "ret_msg": "", "ret_data": None}
        try:
            with connection.cursor() as cursor:
                # Fetch all users
                cursor.execute("""
                    SELECT userid, username, password
                    FROM TBLTENDERUSER
                    ORDER BY userid
                """)
                users = cursor.fetchall()
                columns = [col[0] for col in cursor.description]

                for row in users:
                    row_dict = dict(zip(columns, row))
                    try:
                        salt = PasswordHasher.generate_salt()
                        hash_value = PasswordHasher.compute_hash(row_dict["password"], salt)

                        cursor.execute("""
                            UPDATE TBLTENDERUSER
                            SET PasswordSalt=%s, PasswordHash=%s
                            WHERE userid=%s
                        """, [salt, hash_value, row_dict["userid"]])
                    except Exception as e:
                        print(f"Error updating user {row_dict['userid']}: {e}")
                        result["ret_type"] = 1
                        result["ret_msg"] = str(e)
                        return result

        except Exception as e:
            print(f"Error in change_password_to_salt: {e}")
            result["ret_type"] = 1
            result["ret_msg"] = str(e)

        return result
    
    def save_master_contract_requirement(param):
        result = {"ret_type": 0, "ret_msg": "", "ret_data": None}
        try:
            recordid = 0
            with connection.cursor() as cursor:
                if param.get("mastercontractreqid", 0) > 0:
                    # Update master contract requirement
                    cursor.execute("""
                        UPDATE TBLMASTERCONTRACT
                        SET mastercontractreqname=%s
                        WHERE mastercontractreqid=%s
                    """, [param["mastercontractreqname"], param["mastercontractreqid"]])

                    # Check if any vendors exist for this requirement
                    cursor.execute("""
                        SELECT COUNT(*) FROM TBLMASTERCONTRACTVENDOR
                        WHERE mastercontractreqid=%s
                    """, [param["mastercontractreqid"]])
                    vendor_count = cursor.fetchone()[0]

                    if vendor_count > 0:
                        result["ret_type"] = 1
                        result["ret_msg"] = "Сонгосон ШААРДЛАГА дээр Нийлүүлэгч/харилцагчийн мэдээлэл үүссэн тул устгах боломжгүй."
                        return result
                    else:
                        # Delete previous detail records
                        cursor.execute("""
                            DELETE FROM TBLMASTERCONTRACTDETAIL
                            WHERE mastercontractreqid=%s
                        """, [param["mastercontractreqid"]])

                        recordid = param["mastercontractreqid"]
                else:
                    # Insert new master contract requirement
                    cursor.execute("""
                        INSERT INTO TBLMASTERCONTRACT (mastercontractreqname)
                        VALUES (%s)
                        RETURNING mastercontractreqid
                    """, [param["mastercontractreqname"]])
                    recordid = cursor.fetchone()[0]

                # Insert detail materials
                for row in param.get("materials", []):
                    if row.get("mastercontractdetailreqname"):
                        cursor.execute("""
                            INSERT INTO TBLMASTERCONTRACTDETAIL
                            (mastercontractreqid, mastercontractdetailreqname, mastercontractdetailscore)
                            VALUES (%s, %s, %s)
                        """, [
                            recordid,
                            row["mastercontractdetailreqname"],
                            row.get("mastercontractdetailscore", 0)
                        ])
                result["ret_data"] = recordid
        except Exception as e:
            print(f"Error in save_master_contract_requirement: {e}")
            result["ret_type"] = 1
            result["ret_msg"] = str(e)

        return result
    
    def get_master_contract_req_detail_data(mastercontractreqid):
        result = {"ret_type": 0, "ret_msg": "", "ret_data": {}}
        # Future implementation:
        # Use mastercontractreqid to query TBLMASTERCONTRACTDETAIL or related tables
        return result
    
    def get_master_contract_req_list():
        result = {"ret_type": 0, "ret_msg": "", "ret_data": {"master_contracts": [], "master_contract_details": []}}
        try:
            with connection.cursor() as cursor:
                # Fetch master contract requirements
                cursor.execute("SELECT * FROM TBLMASTERCONTRACT ORDER BY mastercontractreqid")
                columns = [col[0] for col in cursor.description]
                master_contracts = [dict(zip(columns, row)) for row in cursor.fetchall()]
                result["ret_data"]["master_contracts"] = master_contracts

                # Fetch master contract details
                cursor.execute("""
                    SELECT * FROM TBLMASTERCONTRACTDETAIL 
                    ORDER BY mastercontractreqid, mastercontractdetailid
                """)
                columns = [col[0] for col in cursor.description]
                master_contract_details = [dict(zip(columns, row)) for row in cursor.fetchall()]
                result["ret_data"]["master_contract_details"] = master_contract_details

        except Exception as e:
            print(f"Error in get_master_contract_req_list: {e}")
            result["ret_type"] = 1
            result["ret_msg"] = str(e)

        return result
    
    def delete_master_contract_req(mastercontractreqid):
        result = {"ret_type": 0, "ret_msg": "", "ret_data": None}
        try:
            with connection.cursor() as cursor:
                # Check if any vendors exist for this requirement
                cursor.execute("""
                    SELECT COUNT(*) FROM TBLMASTERCONTRACTVENDOR
                    WHERE mastercontractreqid = %s
                """, [mastercontractreqid])
                vendor_count = cursor.fetchone()[0]

                if vendor_count > 0:
                    result["ret_type"] = 1
                    result["ret_msg"] = "Сонгосон ШААРДЛАГА дээр Нийлүүлэгч/харилцагчийн мэдээлэл үүссэн тул устгах боломжгүй."
                    return result

                # Delete details first
                cursor.execute("""
                    DELETE FROM TBLMASTERCONTRACTDETAIL
                    WHERE mastercontractreqid = %s
                """, [mastercontractreqid])

                # Delete master contract requirement
                cursor.execute("""
                    DELETE FROM TBLMASTERCONTRACT
                    WHERE mastercontractreqid = %s
                """, [mastercontractreqid])

        except Exception as e:
            print(f"Error in delete_master_contract_req: {e}")
            result["ret_type"] = 1
            result["ret_msg"] = str(e)

        return result
