
import hashlib
import logging
import random
import secrets
from datetime import datetime, timedelta

import jwt
import requests
from django.conf import settings
from django.core.mail import send_mail
from django.db import connection
from rest_framework import status
from rest_framework.response import Response

from api.models import Tbltenderuser, Tblvendor


logger = logging.getLogger(__name__)

class MakTenderAuthService:
    
    @staticmethod
    def generate_salt():
        return secrets.token_hex(16)

    @staticmethod
    def hash_password(password, salt, pepper, iterations=3):
        value = password + salt + pepper
        for _ in range(iterations):
            value = hashlib.sha256(value.encode()).hexdigest()
        return value

    
    def compute_hash(self, password, salt, pepper, iterations=3):
        value = password + salt + pepper
        for _ in range(iterations):
            value = hashlib.sha256(value.encode()).hexdigest()
        return value


    @staticmethod
    def _invalid_credentials():
        return {
            "success": 0,
            "userid": -1,
            "message": "Нэвтрэх нэр эсвэл нууц үг буруу байна!",
        }

    @staticmethod
    def _row_to_user(row):
        if not row:
            return None
        fields = (
            "userid",
            "username",
            "empid",
            "empname",
            "positionname",
            "vendorid",
            "passwordsalt",
            "passwordhash",
        )
        return dict(zip(fields, row))

    def _find_tender_user(self, username):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT userid, username, empid, empname, positionname,
                    vendorid, passwordsalt, passwordhash
                FROM TBLTENDERUSER
                WHERE LOWER(TRIM(username)) = LOWER(TRIM(%s))
                ORDER BY userid
                LIMIT 1
                """,
                [username],
            )
            return self._row_to_user(cursor.fetchone())

    @staticmethod
    def _is_admin_account(tender_user):
        if not tender_user:
            return False
        vendor_id = tender_user.get("vendorid")
        if (
            tender_user.get("empid")
            or (vendor_id is not None and int(vendor_id) > 0)
            or not tender_user.get("passwordsalt")
            or not tender_user.get("passwordhash")
        ):
            return False
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT 1
                FROM TBLADMIN
                WHERE empid IS NULL
                  AND LOWER(TRIM(email)) = LOWER(TRIM(%s))
                LIMIT 1
                """,
                [tender_user["username"]],
            )
            return cursor.fetchone() is not None

    def _tender_password_matches(self, tender_user, password):
        salt = tender_user.get("passwordsalt")
        stored_hash = tender_user.get("passwordhash")
        if not salt or not stored_hash:
            return False
        password_hash = self.compute_hash(password, salt, settings.PASSWORD_PEPPER)
        return secrets.compare_digest(password_hash.strip(), stored_hash.strip())

    @staticmethod
    def _find_employee(username, tender_user=None):
        with connection.cursor() as cursor:
            if tender_user and tender_user.get("empid"):
                cursor.execute(
                    """
                    SELECT empid, empname, positionname, email
                    FROM TBLEMP
                    WHERE empid = %s
                    ORDER BY empid
                    LIMIT 1
                    """,
                    [tender_user["empid"]],
                )
            else:
                cursor.execute(
                    """
                    SELECT empid, empname, positionname, email
                    FROM TBLEMP
                    WHERE LOWER(TRIM(email)) = LOWER(TRIM(%s))
                    ORDER BY empid
                    LIMIT 1
                    """,
                    [username],
                )
            row = cursor.fetchone()

        if not row:
            return None
        return dict(zip(("empid", "empname", "positionname", "email"), row))

    @staticmethod
    def _authenticate_erp(username, password):
        payload = {
            "jsonrpc": "2.0",
            "params": {
                "db": settings.ERP_DB,
                "login": username,
                "password": password,
            },
        }
        response = requests.post(
            f"{settings.ERP_URL}/web/session/authenticate",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=settings.ERP_AUTH_TIMEOUT,
            verify=settings.ERP_VERIFY_SSL,
        )
        response.raise_for_status()
        data = response.json()
        result = data.get("result") if isinstance(data, dict) else None
        if not isinstance(result, dict) or not result.get("uid"):
            return None
        return result

    @staticmethod
    def _find_employee_tender_user(empid):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT userid, username, empid, empname, positionname,
                    vendorid, passwordsalt, passwordhash
                FROM TBLTENDERUSER
                WHERE empid = %s AND COALESCE(vendorid, 0) <= 0
                ORDER BY userid
                LIMIT 1
                """,
                [empid],
            )
            return MakTenderAuthService._row_to_user(cursor.fetchone())

    @staticmethod
    def _create_employee_tender_user(username, employee):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO TBLTENDERUSER
                    (username, empid, empname, positionname)
                VALUES (%s, %s, %s, %s)
                RETURNING userid
                """,
                [
                    username,
                    employee["empid"],
                    employee.get("empname") or username,
                    employee.get("positionname") or "",
                ],
            )
            return cursor.fetchone()[0]

    @staticmethod
    def _attach_employee_to_tender_user(tender_user, employee):
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE TBLTENDERUSER
                SET empid = %s, empname = %s, positionname = %s
                WHERE userid = %s
                """,
                [
                    employee["empid"],
                    employee.get("empname") or tender_user["username"],
                    employee.get("positionname") or "",
                    tender_user["userid"],
                ],
            )
        return {
            **tender_user,
            "empid": employee["empid"],
            "empname": employee.get("empname"),
            "positionname": employee.get("positionname"),
        }

    @staticmethod
    def _session_response(userid, username, role, empname, positionname, vendorid=None, empid=None):
        payload = {
            "userid": userid,
            "username": username,
            "role": role,
            "vendorid": vendorid,
            "empid": empid,
            "exp": datetime.utcnow() + timedelta(hours=2),
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
        return {
            "success": 1,
            "userid": userid,
            "username": empname or username,
            "positionname": positionname or "",
            "vendorid": vendorid or 0,
            "empid": empid,
            "role": role,
            "token": token,
        }

    def login_service(self, param):
        username = str(param.get("username") or "").strip()
        password = str(param.get("password") or "")
        if not username or not password:
            return self._invalid_credentials()

        try:
            tender_user = self._find_tender_user(username)

            if self._is_admin_account(tender_user):
                if not self._tender_password_matches(tender_user, password):
                    return self._invalid_credentials()
                return self._session_response(
                    userid=tender_user["userid"],
                    username=tender_user["username"],
                    role="admin",
                    empname=tender_user.get("empname"),
                    positionname=tender_user.get("positionname"),
                )

            # Only positive vendor IDs are suppliers; legacy employee rows use -1.
            vendorid = tender_user.get("vendorid") if tender_user else None
            if vendorid is not None and int(vendorid) > 0:
                if not self._tender_password_matches(tender_user, password):
                    return self._invalid_credentials()
                return self._session_response(
                    userid=tender_user["userid"],
                    username=tender_user["username"],
                    role="vendor",
                    empname=tender_user.get("empname"),
                    positionname=tender_user.get("positionname"),
                    vendorid=vendorid,
                )

            # Employees are identified from the synchronized ERP employee directory.
            employee = self._find_employee(username, tender_user)
            if not employee:
                return self._invalid_credentials()

            if not self._authenticate_erp(username, password):
                return self._invalid_credentials()

            if tender_user and tender_user.get("empid"):
                employee_user = tender_user
                created = False
            elif tender_user:
                employee_user = self._attach_employee_to_tender_user(
                    tender_user,
                    employee,
                )
                created = False
            else:
                employee_user = self._find_employee_tender_user(employee["empid"])
                created = employee_user is None
                if created:
                    userid = self._create_employee_tender_user(username, employee)
                    employee_user = {"userid": userid, "username": username}

            result = self._session_response(
                userid=employee_user["userid"],
                username=employee_user.get("username") or username,
                role="employee",
                empname=employee.get("empname"),
                positionname=employee.get("positionname"),
                empid=employee["empid"],
            )
            result["created"] = created
            return result
        except requests.RequestException:
            logger.exception("ERP employee login request failed")
            return {
                "success": 0,
                "userid": -1,
                "message": "ERP системтэй холбогдож чадсангүй. Түр хүлээгээд дахин оролдоно уу.",
            }
        except (ValueError, TypeError):
            logger.exception("ERP employee login returned an invalid response")
            return {
                "success": 0,
                "userid": -1,
                "message": "ERP системээс буруу форматтай хариу ирлээ.",
            }
        except Exception:
            logger.exception("Tender login failed")
            return {
                "success": 0,
                "userid": -1,
                "message": "Нэвтрэх үед алдаа гарлаа. Түр хүлээгээд дахин оролдоно уу.",
            }

    def reset_password_service(self, email):

        vendor = Tblvendor.objects.filter(vendoremail=email).first()

        if not vendor:
            return Response(
                {"success": 0, "message": "Таны оруулсан и-мэйл хаяг системд бүртгэлгүй байна."},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            verification_code = random.randint(100000, 999999)

            vendor.verification = verification_code
            vendor.save()

            subject = "МАК-Цахим тендер: нууц үг сэргээх хүсэлт"

            body = (
                f"Сайн байна уу.<br/><br/>"
                f"Нууц үг өөрчлөх хүсэлтийг баталгаажуулах код: "
                f"<b>{verification_code}</b><br/><br/>"
                "tender.mak.mn"
            )

            send_mail(
                subject,
                "",
                "no-reply@mak.mn",
                [email],
                html_message=body,
                fail_silently=False,
            )

            return Response(
                {"success": 1, "message": "Verification code sent to your email."},
                status=status.HTTP_200_OK
            )

        except Exception as e:
            print(f"[reset_password_service] Error: {e}")

            return Response(
                {"success": 0, "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def save_reset_pwd(self, username, password, verification_code):

        try:
            vendor = Tblvendor.objects.filter(verification=verification_code).first()

            if not vendor:
                return Response(
                    {"success": 0, "message": "Таны оруулсан баталгаажуулах код буруу байна."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            vendorid = vendor.vendorid

            tender_user = Tbltenderuser.objects.filter(vendorid=vendorid).first()

            if not tender_user:
                return Response(
                    {"success": 0, "message": "Tender user not found."},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            pepper = settings.PASSWORD_PEPPER

            password_salt = self.generate_salt()
            password_hash = self.compute_hash(password, password_salt, pepper)

            tender_user.username = username
            tender_user.passwordhash = password_hash
            tender_user.passwordsalt = password_salt
            tender_user.save()

            return Response(
                {"success": 1, "message": "Password reset successful."},
                status=status.HTTP_200_OK
            )

        except Exception as e:
            print(f"[save_reset_password_service] Error: {e}")

            return Response(
                {"success": 0, "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
auth_service = MakTenderAuthService()
