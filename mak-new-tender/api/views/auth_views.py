from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings
from api.models import Tbltenderuser
from api.serializers.auth_serializer import LoginSerializer, NewUserSerializer, ResetPwdSerializer
from api.services.auth_service import auth_service


@api_view(["POST"])
def new_user(request):
    serializer = NewUserSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    data = serializer.validated_data

    salt = auth_service.generate_salt()
    password_hash = auth_service.hash_password(
        data["password"],
        salt,  
        settings.PASSWORD_PEPPER,
        iterations=3,
    )
     
    user = Tbltenderuser.objects.create(
        username=data["username"],
        password=data["password"],  
        empname=data["empname"],
        positionname=data["positionname"],
        passwordsalt=salt,
        passwordhash=password_hash,
    )

    return Response(
        {
            "success": True,
            "userid": user.userid
        },
        status=status.HTTP_201_CREATED
    )


@api_view(['POST'])
def login(request):
    result = auth_service.login_service(request.data)

    if result.get("success") == 1:
        return Response(result, status=200)
    else:
        return Response(result, status=400)


@api_view(['POST'])
def reset_password(request):

    serializer = ResetPwdSerializer(data=request.data)

    if not serializer.is_valid():
        return Response(
            {"success": 0, "message": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST
        )

    email = serializer.validated_data["email"]

    return auth_service.reset_password_service(email)


@api_view(["POST"])
def save_reset_pwd(request):

    serializer = ResetPwdSerializer(data=request.data)

    if not serializer.is_valid():
        return Response(
            {"success": 0, "message": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST
        )

    username = serializer.validated_data["username"]
    password = serializer.validated_data["password"]
    verification_code = serializer.validated_data["verificationcode"]

    return auth_service.save_reset_pwd(username, password, verification_code)