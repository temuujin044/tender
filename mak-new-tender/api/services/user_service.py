from api.models import Tblinvitation
from django.conf import settings
import requests
def get_users_invitation_ids(user_id):

    if not user_id:
        return None 

    
    qs = Tblinvitation.objects.filter(
        createdby=user_id   
    ).values_list("invitationid", flat=True)

    ids = list(qs)

    return ids if ids else None

def obtain_erp_session(url: str) -> str:
        try:
            payload = {
                "jsonrpc": "2.0",
                "params": {
                    "db": settings.ERP_LOGIN["DATABASE"],
                    "login": settings.ERP_LOGIN["USERNAME"],
                    "password": settings.ERP_LOGIN["PASSWORD"]
                }
            }

            headers = {
                "Content-Type": "application/json; charset=UTF-8",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*"
            }

            response = requests.post(f"{url}/tender/session/authenticate", json=payload, headers=headers, verify=False)
            response.raise_for_status()

            # Get session_id from Set-Cookie
            cookies = response.cookies
            session_id = cookies.get("session_id", "")
            return session_id

        except Exception as e:
            print(f"Error obtaining ERP session: {e}")
            return ""
