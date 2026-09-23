from rest_framework import serializers
from api.models import Tbltender , Tblinvitation, Tblinvitationofvendor, Tbltendertype, Tblvendor ,Tbljoinwork, Tbltenderbatch, Tblpurchasetype , Tbldepartment, Tbltenderdelay, TenderEvaluationStatus
class TenderEvaluationStatusUpdateSerializer(serializers.Serializer):
    status = serializers.CharField()

    def validate_status(self, value):
        value = value.upper()

        if not TenderEvaluationStatus.objects.filter(code=value).exists():
            raise serializers.ValidationError(
                f"Илгээсэн статус код буруу байна. : {value}"
            )

        return value
class FilterReportSerializer(serializers.Serializer):
    start_date = serializers.DateField(required=False)
    end_date = serializers.DateField(required=False)
    user_id = serializers.IntegerField(required=False)

class FinishInvitationSerializer(serializers.Serializer):
    invitationid = serializers.IntegerField()

class TenderFilterSerializer(serializers.Serializer):
    status = serializers.CharField(required=False)
    category = serializers.CharField(required=False)
    user_id = serializers.IntegerField(required=False)

class TenderDelaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Tbltenderdelay
        fields = "__all__"

class TBLTENDERSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tbltender
        fields = '__all__' 

class TenderBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tbltenderbatch
        fields = "__all__"

class TBLINVITATIONSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tblinvitation
        fields = '__all__'

class TBLJOINWORKSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tbljoinwork
        fields = '__all__'

class TBLTENDERTYPESerializer(serializers.ModelSerializer):
    class Meta:
        model = Tbltendertype
        fields = '__all__'

class TBLINVITATIONOFVENDORSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tblinvitationofvendor
        fields = '__all__'

class TBLVENDORSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tblvendor
        fields = '__all__'

class TBLINVITATIONOFTENDERSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    invitation_id = serializers.IntegerField()
    tender_id = serializers.IntegerField()
    vendor_id = serializers.IntegerField()

class EvaluationScoreSerializer(serializers.Serializer):
    invitationid = serializers.IntegerField()
    vendorid = serializers.IntegerField()
    criteriaid = serializers.IntegerField()
    result = serializers.FloatField()


class EvalutaioinMemberSerializer(serializers.Serializer):
    empid = serializers.IntegerField()
    createdby = serializers.CharField()
    param = EvaluationScoreSerializer(many=True)


class FinalEvaluationSerializer(serializers.Serializer):
    invitationid = serializers.IntegerField()
    vendorid = serializers.IntegerField()
    status = serializers.IntegerField()
    note = serializers.CharField(required=False, allow_blank=True)

class OpenTenderSerializer(serializers.Serializer):
    tender_id = serializers.IntegerField()
    vendor_id = serializers.IntegerField(required=False)

class RePublishInvitationSerializer(serializers.Serializer):
    invitationid = serializers.IntegerField()
    tenderid = serializers.IntegerField()
    createdby = serializers.CharField()

class RePublishRequestSerializer(serializers.Serializer):
    invitationid = serializers.IntegerField()
    tendername = serializers.CharField()

class RejectInvSerializer(serializers.Serializer):
    invitation_id = serializers.IntegerField()
    reason = serializers.CharField(max_length=500)

class DelayInvitationSerializer(serializers.Serializer):
    invitation_id = serializers.IntegerField()
    new_date = serializers.DateField()

class PublishRequestSerializer(serializers.Serializer):
    request_id = serializers.IntegerField()
    details = serializers.CharField(required=False)

class RePublishInvSerializer(serializers.Serializer):
    invitation_id = serializers.IntegerField()
    reason = serializers.CharField(required=False)

class InvitationVendorSelectionSerializer(serializers.Serializer):
    invitationid = serializers.IntegerField()
    vendorid = serializers.IntegerField()
    empid = serializers.IntegerField()
    first_round_status = serializers.IntegerField()
    first_round_comment = serializers.CharField(allow_blank=True)
    createdby = serializers.CharField()

class TBLTenderJoinDocSerializer(serializers.Serializer):
    join_doc_id = serializers.IntegerField()
    tender_id = serializers.IntegerField()
    invitation_id = serializers.IntegerField()

class MasterContractSerializer(serializers.Serializer):
    mastercontractreqid = serializers.IntegerField(required=False)

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tbldepartment
        fields = "__all__"


class TenderDocTypeSerializer(serializers.Serializer):
    doctypeid = serializers.IntegerField(required=False)
    name = serializers.CharField(max_length=255)
    isactive = serializers.BooleanField(default=True)


class RequireTypeSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    name = serializers.CharField(max_length=255)
    isactive = serializers.BooleanField(default=True)


class CriteriaTypeSerializer(serializers.Serializer):
    criteriatypeid = serializers.IntegerField(required=False)
    name = serializers.CharField(max_length=255)
    isactive = serializers.BooleanField(default=True)


class MemberTypeSerializer(serializers.Serializer):
    membertypeid = serializers.IntegerField(required=False)
    name = serializers.CharField(max_length=255)
    isactive = serializers.BooleanField(default=True)


class VendorActivitySerializer(serializers.Serializer):
    activityid = serializers.IntegerField(required=False)
    name = serializers.CharField(max_length=255)
    isactive = serializers.BooleanField(default=True)


class VendorSubActivitySerializer(serializers.Serializer):
    subactivityid = serializers.IntegerField(required=False)
    activityid = serializers.IntegerField()
    name = serializers.CharField(max_length=255)
    isactive = serializers.BooleanField(default=True)


class EmailCCSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    email = serializers.EmailField()
    isactive = serializers.BooleanField(default=True)


class CodeSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    code = serializers.CharField(max_length=50)
    description = serializers.CharField(max_length=255)
    isactive = serializers.BooleanField(default=True)


class EvaluationSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    empid = serializers.IntegerField()
    role = serializers.CharField(max_length=100)
    isactive = serializers.BooleanField(default=True)


class SettingsSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    key = serializers.CharField(max_length=255)
    value = serializers.CharField(max_length=255)
    isactive = serializers.BooleanField(default=True)


class OdooSessionSerializer(serializers.Serializer):
    db = serializers.CharField()
    uid = serializers.IntegerField()
    password = serializers.CharField()


class JoinWorkSerializer(serializers.Serializer):
    joinworkid = serializers.IntegerField(required=False)
    title = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False)
    isactive = serializers.BooleanField(default=True)


class JoinWorkOfVendorSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    joinworkid = serializers.IntegerField()
    vendorid = serializers.IntegerField()
    status = serializers.CharField(max_length=50, required=False)


class VendorSerializer(serializers.Serializer):
    vendorid = serializers.IntegerField(required=False)
    name = serializers.CharField(max_length=255)
    email = serializers.EmailField(required=False)
    phone = serializers.CharField(max_length=50, required=False)
    isactive = serializers.BooleanField(default=True)


class MailDataSerializer(serializers.Serializer):
    to = serializers.EmailField()
    subject = serializers.CharField(max_length=255)
    body = serializers.CharField()


class InvitationSerializer(serializers.Serializer):
    invitationid = serializers.IntegerField(required=False)
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False)


class CommentSerializer(serializers.Serializer):
    commentid = serializers.IntegerField(required=False)
    invitationid = serializers.IntegerField()
    vendorid = serializers.IntegerField()
    message = serializers.CharField()


class QuoteSerializer(serializers.Serializer):
    qouteid = serializers.IntegerField(required=False)
    tenderid = serializers.IntegerField()
    vendorid = serializers.IntegerField()
    amount = serializers.FloatField()
    notes = serializers.CharField(required=False)


class TenderTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tbltendertype
        fields = "__all__"


class PurchaseTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tblpurchasetype
        fields = "__all__"

from rest_framework import serializers


class TenderDocJoinSerializer(serializers.Serializer):
    joindocid = serializers.IntegerField(required=False)
    invitationid = serializers.IntegerField()
    tenderid = serializers.IntegerField()
    vendorid = serializers.IntegerField(required=False)


class FolderCaseSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    invitationid = serializers.IntegerField()
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False)


class JoinWorkTaskSerializer(serializers.Serializer):
    jointaskid = serializers.IntegerField(required=False)
    joinworkid = serializers.IntegerField()
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False)
    status = serializers.CharField(max_length=50, required=False)


class TenderDocSerializer(serializers.Serializer):
    docid = serializers.IntegerField(required=False)
    invitationid = serializers.IntegerField()
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False)


class JoinWorkDocSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    joinworkid = serializers.IntegerField()
    vendorid = serializers.IntegerField()
    title = serializers.CharField(max_length=255)


class VendorCompanyDocSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    vendorid = serializers.IntegerField()
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False)


class CriteriaSerializer(serializers.Serializer):
    criteriaid = serializers.IntegerField(required=False)
    invitationid = serializers.IntegerField()
    joinworkid = serializers.IntegerField()
    name = serializers.CharField(max_length=255)
    score = serializers.FloatField()


class RequireSerializer(serializers.Serializer):
    requireid = serializers.IntegerField(required=False)
    invitationid = serializers.IntegerField()
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False)


class NotesSerializer(serializers.Serializer):
    noteid = serializers.IntegerField(required=False)
    invitationid = serializers.IntegerField()
    joinworkid = serializers.IntegerField()
    note = serializers.CharField()
