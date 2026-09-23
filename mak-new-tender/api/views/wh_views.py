from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from api.services.wh_service import wh_service


@api_view(['GET'])
def get_doing_list(request):
    return wh_service.get_doing_list_service()


@api_view(['GET'])
def get_order_list(request):
    return wh_service.get_order_list_service()


@api_view(['GET'])
def get_trans_list(request):
    return wh_service.get_trans_list_service()
    


@api_view(['GET'])
def get_consume_list(request):
    return wh_service.get_consume_list_service()


@api_view(['GET'])
def get_purchase_order_line(request, orderid):
    return wh_service.get_purchase_order_line_service(orderid)


@api_view(['POST'])
def save_purchase_order_line(request):
    lines = request.data
    return wh_service.save_purchase_order_line_service(lines)


@api_view(['POST'])
def save_order_line_allocate(request):

    result = wh_service.save_order_line_allocate(request.data)

    return Response(result)


@api_view(["DELETE"])
def delete_purchase_order_line(request):

    lineid = request.data.get("id")
    orderid = request.data.get("orderid")

    result = wh_service.delete_purchase_order_line(lineid, orderid)

    return Response(result)


@api_view(['POST'])
def save_receipt(request):

    result = wh_service.save_receipt(request.data)

    return Response(result)


@api_view(['GET'])
def get_transit_order_line(request, transitid):
    result = wh_service.get_transit_order_line(transitid)
    return Response(result)


@api_view(['POST'])
def save_transit_order_line(request):
    result = wh_service.save_transit_order_line(request.data)
    return Response(result)


@api_view(["DELETE"])
def delete_transit_order_line(request):
    param = request.data 
    result = wh_service.delete_transit_order_line(param)
    return Response(result)


@api_view(['POST'])
def save_transit(request):

    result = wh_service.save_transit(request.data)
    return Response(result)


@api_view(["GET"])
def get_consume_order_line(request, consumeid):
    result = wh_service.get_consume_order_line(consumeid)
    return Response(result)


@api_view(['POST'])
def save_consume_order_line(request):
    result = wh_service.save_consume_order_line(request.data)
    return Response(result)


@api_view(["DELETE"])
def delete_consume_order_line(request, lineid):
    result = wh_service.delete_consume_order_line(lineid)
    return Response(result)


@api_view(['POST'])
def save_issue(request):
    result = wh_service.save_issue(request.data)
    return Response(result)
