import mimetypes
from api.models import Tblcode , Tbldepartment
from django.db import transaction
from django.utils import timezone

def get_mime_type(file_name: str) -> str:
    mime_type, _ = mimetypes.guess_type(file_name)
    return mime_type or "application/octet-stream"

def getNextCode(codetypeid: int, tendertypeid: int, departmentid: int) -> str:
    try:
        dep = Tbldepartment.objects.filter(departmentid=departmentid).first()
        if not dep or not dep.depcode:
            return ""
        depcode = dep.depcode

        code_row = Tblcode.objects.select_for_update().filter(
            codetypeid=codetypeid,
            tendertypeid=tendertypeid
        ).first()

        if not code_row:
            return ""

        newnumber = code_row.newnumber or 0
        numberStr = f"{newnumber:04d}"

        today = timezone.now().date()
        if codetypeid in (1, 2):
            code = f"{depcode}-{today.year}{today.month:02d}{numberStr}"
        else:
            code = f"{depcode}-{numberStr}"

        code_row.newnumber += 1
        code_row.save(update_fields=["newnumber"])

        return code

    except Exception as ex:
        print("getNextCode error:", str(ex))
        return ""