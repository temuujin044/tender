"""A frozen, user-facing projection. Raw audit rows remain untouched."""
from collections import Counter, defaultdict

from django.db import connection
from api.models import AuditSummary


# Only these business fields may leave the summary API. No ID, timestamp,
# generated code, password or arbitrary database column is a detail field.
SPECS = {
    "tblinvitationofvendor": ("Нийлүүлэгчийн шийдвэр", "id", {"status": "Төлөв", "note": "Шийдвэрийн тайлбар"}),
    "tblrequire": ("Шаардлага", "requireid", {"requirename": "Шаардлагын агуулга", "requiretypeid": "Төрөл", "document_required": "Баримт хавсаргах"}),
    "tblcriteria": ("Шалгуур", "criteriaid", {"criterianame": "Шалгуурын агуулга", "criteriatypeid": "Төрөл", "weight": "Жин (%)"}),
    "tbltender": ("Тендер", "tenderid", {"tendername": "Тендерийн нэр", "budget": "Төсөв", "activityid": "Үйл ажиллагааны чиглэл", "departmentid": "Хариуцсан нэгж", "tendertypeid": "Тендерийн төрөл", "purchasetypeid": "Худалдан авалтын төрөл", "startdate": "Эхлэх хугацаа", "enddate": "Дуусах хугацаа", "evaluationdate": "Үнэлгээний хугацаа", "publishdate": "Нийтлэх хугацаа"}),
    "tblinvitation": ("Урилга", "invitationid", {"acceptdate": "Санал хүлээн авах хугацаа", "opendate": "Санал нээх хугацаа", "description": "Тайлбар", "note": "Тэмдэглэл", "status": "Төлөв"}),
    "tbltenderbatch": ("Багц", "batchid", {"batchname": "Багцын нэр", "budget": "Төсөвт үнэ"}),
    "tblevaluation": ("Хорооны гишүүн", "evaluationid", {"empname": "Ажилтан", "positionname": "Албан тушаал", "roleid": "Эрх"}),
    "tbltenderdoc": ("Баримт", "docid", {"documentname": "Баримтын нэр"}),
    "tbltenderjoindoc": ("Баримт", "docid", {"documentname": "Баримтын нэр"}),
    "tblvendordoc": ("Баримт", "docid", {"documentname": "Баримтын нэр"}),
    "tblqoute": ("Үнийн санал", "qouteid", {"qouteamount": "Саналын дүн", "deliveryday": "Нийлүүлэх хоног", "deliverydate": "Нийлүүлэх хугацаа"}),
    "tblvendor": ("Нийлүүлэгч", "vendorid", {"vendorname": "Компанийн нэр", "activity": "Үйл ажиллагаа", "address": "Хаяг", "vendorphone": "Утас", "vendoremail": "Имэйл"}),
    "tblvendoractivity": ("Үйл ажиллагааны чиглэл", "activityid", {"activity": "Чиглэлийн нэр"}),
    "tblcomment": ("Сэтгэгдэл", "commentid", {"commenttitle": "Гарчиг", "comment": "Агуулга"}),
    "tblsettings": ("Тохиргоо", "id", {"empid": "Ажилтан", "actionid": "Үйлдэл", "membertypeid": "Эрх"}),
}
ENUMS = {
    "requiretypeid": {14: "Санхүүгийн", 35: "Техникийн", 54: "Ерөнхий"},
    "criteriatypeid": {1: "Санхүүгийн", 24: "Туршлагын", 27: "Техникийн"},
    "roleid": {1: "Дарга", 2: "Нарийн бичиг", 3: "Гишүүн", 4: "Дотоод хяналт"},
    "status": {0: "Ноорог", 1: "Нийтэлсэн", 2: "Санал илгээсэн", 3: "Үнэлж байгаа", 4: "Шалгараагүй", 5: "Шалгарсан", 6: "Нийтлэх зөвшөөрөл хүлээж байгаа", 7: "Үр дүн нийтэлсэн", 8: "Цуцалсан", 9: "Дахин зарлах зөвшөөрөл хүлээж байгаа", 10: "Дахин зарласан"},
}
ACTION_LABELS = {
    "publish_tender_from_portal_view": "Тендер нийтэлсэн",
    "delete_tender": "Тендер устгасан",
    "send_email_view": "Имэйл илгээсэн",
    "tender_open_log_view": "Тендер нээсэн",
    "finish_invitation": "Тендер дуусгасан",
    "reject_invitation": "Тендер цуцалсан",
}


def display_row(table, row, historical=False):
    if row is None:
        return None
    result = {}
    for field, label in SPECS[table][2].items():
        value = row.get(field)
        if field == "document_required":
            value = "Бүртгээгүй" if value is None else "Заавал" if value else "Заавал биш"
        elif field in ENUMS and value is not None:
            value = ENUMS[field].get(value, "Бусад")
        elif field.endswith("id") and table in {"tblsettings", "tbltender"}:
            # Resolved from DB during capture, then frozen in audit_summary.
            lookup = {"empid": ("tblemp", "empid", "empname"), "actionid": ("tblaction", "id", "actionname"), "membertypeid": ("tblmembertype", "membertypeid", "membertypename"), "activityid": ("tblvendoractivity", "activityid", "activity"), "departmentid": ("tbldepartment", "departmentid", "departmentname"), "tendertypeid": ("tbltendertype", "tendertypeid", "tendertypename"), "purchasetypeid": ("tblpurchasetype", "purchasetypeid", "purchasetypename")}
            if historical or value is None:
                result[label] = "Түүхэн нэр бүртгэгдээгүй" if value is not None else None
                continue
            source, pk, name = lookup[field]
            with connection.cursor() as cursor:
                cursor.execute("SELECT to_regclass(%s)", [source])
                exists = cursor.fetchone()[0]
                if exists:
                    cursor.execute(f"SELECT {name} FROM {source} WHERE {pk}=%s LIMIT 1", [value])
                    match = cursor.fetchone()
                    value = match[0] if match else "Тодорхойгүй"
                else:
                    value = "Тодорхойгүй"
        result[label] = value
    return result


def semantic_details(changes, historical=False):
    """Cancel exact delete/reinsert pairs as a multiset, never by timing.

    Stable IDs identify real edits. Unrelated removals/additions are not guessed
    to be edits when older code regenerated IDs.
    """
    groups = defaultdict(list)
    for change in changes:
        if change.table_name in SPECS:
            groups[change.table_name].append(change)
    result = []
    for table, rows in groups.items():
        category, pk, _ = SPECS[table]
        deleted, inserted = [], []
        for row in rows:
            before, after = display_row(table, row.before, historical), display_row(table, row.after, historical)
            if row.operation == "delete":
                deleted.append((row.before.get(pk), before))
            elif row.operation == "insert":
                inserted.append((row.after.get(pk), after))
            elif any(row.before.get(field) != row.after.get(field) for field in SPECS[table][2]):
                result.append({"category": category, "operation": "update", "before": before, "after": after})
        # Match unchanged content regardless of regenerated database IDs.
        remaining_inserted = list(inserted)
        remaining_deleted = []
        for key, before in deleted:
            match = next((i for i, (_, after) in enumerate(remaining_inserted) if before == after), None)
            if match is None:
                remaining_deleted.append((key, before))
            else:
                remaining_inserted.pop(match)
        for key, before in remaining_deleted:
            match = next((i for i, (other_key, _) in enumerate(remaining_inserted) if key is not None and other_key == key), None)
            if match is not None:
                _, after = remaining_inserted.pop(match)
                result.append({"category": category, "operation": "update", "before": before, "after": after})
            else:
                result.append({"category": category, "operation": "delete", "before": before, "after": None})
        result.extend({"category": category, "operation": "insert", "before": None, "after": after} for _, after in remaining_inserted)
    return result


def create_summary(event, historical=False):
    changes = list(event.changes.order_by("id"))
    details = semantic_details(changes, historical) if event.outcome == "success" else []
    tender_row = next((c.after or c.before for c in changes if c.table_name == "tbltender"), {})
    tender_id = tender_row.get("tenderid")
    invitation_id = None
    for change in changes:
        row = change.after or change.before or {}
        tender_id = tender_id or row.get("tenderid")
        invitation_id = invitation_id or row.get("invitationid")
    # Resolve the label now, not when history is later displayed.
    if not historical and not tender_row and (tender_id or invitation_id):
        with connection.cursor() as cursor:
            cursor.execute("SELECT to_regclass('tbltender'), to_regclass('tblinvitation')")
            has_tender, has_invitation = cursor.fetchone()
            if has_tender and (tender_id or has_invitation):
                if not tender_id:
                    cursor.execute("SELECT tenderid FROM tblinvitation WHERE invitationid=%s", [invitation_id])
                    match = cursor.fetchone()
                    tender_id = match[0] if match else None
                cursor.execute("SELECT tendername, tendercode FROM tbltender WHERE tenderid=%s", [tender_id])
                match = cursor.fetchone()
                if match:
                    tender_row = {"tendername": match[0], "tendercode": match[1]}
    created = any(c.table_name == "tbltender" and c.operation == "insert" for c in changes)
    if event.outcome != "success":
        title = "Үйлдэл амжилтгүй болсон"
    elif created:
        title = "Тендерийн ноорог үүсгэсэн"
    elif event.action in ACTION_LABELS:
        title = ACTION_LABELS[event.action]
    else:
        counts = Counter((d["category"], d["operation"]) for d in details)
        verbs = {"insert": "нэмсэн", "update": "зассан", "delete": "хассан"}
        title = ", ".join(f"{count if count > 1 else ''} {category.lower()} {verbs[op]}".strip() for (category, op), count in counts.items())
        title = title[:1].upper() + title[1:] if title else "Мэдээлэл хадгалсан"
    # Keep unsupported business actions visible, but suppress known unchanged
    # saves and generated-code bookkeeping. Raw events are never removed.
    known = event.action in {"save_tender", "save_invitation_header", "save_tender_draft_details_view", "save_portal_tender_view", "save_settings_view"}
    visible = bool(details) or event.outcome != "success" or not known or created
    return AuditSummary.objects.create(event=event, title=title[:250],
        entity_name=tender_row.get("tendername") or "", entity_code=tender_row.get("tendercode") or "",
        details=details, visible=visible)
