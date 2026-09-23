from rest_framework import serializers

class NewUserSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()
    empname = serializers.CharField()
    positionname = serializers.CharField()

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()

class ResetPwdSerializer(serializers.Serializer):
    email = serializers.EmailField()
    token = serializers.CharField(required=False)
    new_password = serializers.CharField(required=False)
