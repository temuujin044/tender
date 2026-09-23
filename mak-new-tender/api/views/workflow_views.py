from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied, ValidationError

from api.services.audit_service import verified_actor
from api.services.tender_service import TenderService
from api.services.workflow_service import evaluation_invitation_ids, transition, workflow


@api_view(['GET', 'POST'])
def invitation_workflow(request):
    try:
        actor = getattr(request, 'audit_actor', None) or verified_actor(request)
    except ValueError:
        raise AuthenticationFailed('Дахин нэвтэрнэ үү.')
    if request.method == 'GET':
        return Response({'retType': 0, 'retData': workflow(actor, request.query_params.get('invitationid'))})
    return Response({'retType': 0, 'retData': transition(actor, request.data)})


@api_view(['GET'])
def my_permissions(request):
    try:
        actor = verified_actor(request)
    except ValueError:
        raise AuthenticationFailed('Дахин нэвтэрнэ үү.')
    if actor['role'] != 'employee':
        raise PermissionDenied('Ажилтны эрх шаардлагатай.')
    result = TenderService.get_permission(actor['employee_id'])
    if result['RetType'] != 0:
        raise ValidationError('Эрхийн тохиргоог ачаалж чадсангүй.')
    return Response(result)


@api_view(['GET'])
def evaluation_invitations(request):
    try:
        actor = verified_actor(request)
    except ValueError:
        raise AuthenticationFailed('Дахин нэвтэрнэ үү.')
    return Response({'retType': 0, 'retData': evaluation_invitation_ids(actor)})


def legacy_transition(action):
    @api_view(['POST'])
    def legacy(request):
        data = dict(request.data)
        data['action'] = action
        data['invitationid'] = data.get('invitationid') or data.get('invitation_id')
        data['note'] = data.get('note') or data.get('rejectnote') or data.get('reason') or data.get('description') or ''
        return Response({'retType': 0, 'retData': transition(request.audit_actor, data)})
    return legacy


@api_view(['POST'])
def retired_status_write(request):
    raise ValidationError('Энэ хуучин төлөв өөрчлөх API хаагдсан. Урилгын үйлдлийн API ашиглана уу.')
