"""Invitation lifecycle. All writes lock the invitation before checking its state."""
import re

from datetime import datetime
from zoneinfo import ZoneInfo

from django.db import connection, transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError, NotFound

from api.services.activity_matching_service import (
    queue_activity_invitations,
    # send_pending_invitation_emails,
)

LABELS = {0: 'Ноорог', 6: 'Нийтлэх зөвшөөрөл хүлээж байгаа',
          1: 'Нийтэлсэн / санал хүлээн авч байгаа', 3: 'Үнэлгээ хийж байгаа',
          7: 'Үр дүн нийтэлсэн', 8: 'Цуцалсан',
          9: 'Дахин зарлах зөвшөөрөл хүлээж байгаа', 10: 'Дахин зарласан'}
VENDOR_LABELS = {0: 'Ноорог', 2: 'Санал илгээсэн', 3: 'Үнэлж байгаа',
                 4: 'Шалгараагүй', 5: 'Шалгарсан'}
COMMITTEE_ROLE_IDS = {'chair': 1, 'secretary': 2, 'member': 3, 'internal-control': 4}
REQUIRED_VENDOR_DOCUMENT_TYPE_IDS = (1001, 1002, 1003, 1004)
LEGACY_PRIMARY_KEYS = {
    'tbltender': 'tenderid',
    'tbltenderbatch': 'batchid',
    'tblrequire': 'requireid',
    'tblcriteria': 'criteriaid',
    'tblevaluation': 'evaluationid',
    'tblnotes': 'noteid',
    'tbltenderdoc': 'docid',
    'tblfiles': 'fileid',
}
# Source states, target and the business permission/policy required.
RULES = {
    'request_publish': ({0}, 6, 'manage_responsible'),
    'publish': ({6}, 1, 'isTenderApprove'),
    'return_draft': ({6}, 0, 'isTenderApprove'),
    'open': ({1}, 3, 'committee_open'),
    'decide': ({3}, None, 'committee_chair'),
    'finish': ({3}, 7, 'isTenderApprove'),
    'cancel': ({1, 3}, 8, 'isTenderCancel'),
    'request_republish': ({7, 8}, 9, 'manage_responsible'),
    'republish': ({9}, 10, 'isTenderApprove'),
    'return_republish': ({9}, None, 'isTenderApprove'),
    'extend': ({1}, 1, 'manage_responsible'),
}


def positive_id(value):
    if isinstance(value, bool):
        raise ValidationError('Зөв ID шаардлагатай.')
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        raise ValidationError('Зөв ID шаардлагатай.')
    if number <= 0:
        raise ValidationError('Зөв ID шаардлагатай.')
    return number


def local_datetime(value):
    if not value:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            raise ValidationError('Огнооны формат буруу байна.')
    # The portal's datetime-local fields and legacy timestamp columns are Mongolia time.
    return value.replace(tzinfo=ZoneInfo('Asia/Ulaanbaatar')) if timezone.is_naive(value) else value


def invitation(cursor, key, lock=True):
    cursor.execute('SELECT invitationid,tenderid,status,'
                   'CASE WHEN EXTRACT(YEAR FROM acceptdate) BETWEEN 1 AND 9999 THEN acceptdate END,'
                   'CASE WHEN EXTRACT(YEAR FROM opendate) BETWEEN 1 AND 9999 THEN opendate END,'
                   'createdby,republish_origin_status '
                   'FROM tblinvitation WHERE invitationid=%s' + (' FOR UPDATE' if lock else ''), [positive_id(key)])
    row = cursor.fetchone()
    if not row:
        raise NotFound('Урилга олдсонгүй.')
    return dict(zip(('id', 'tenderid', 'status', 'acceptdate', 'opendate', 'createdby', 'origin'), row))


def employee_access(cursor, actor, inv):
    from api.services.tender_service import TenderService
    if actor['role'] != 'employee':
        raise PermissionDenied('Ажилтны эрх шаардлагатай.')
    result = TenderService.get_permission(actor['employee_id'])
    if result['RetType'] != 0:
        raise PermissionDenied('Эрхийн тохиргоог шалгаж чадсангүй.')
    flags = result['RetData']
    cursor.execute('SELECT username,empname FROM tbltenderuser WHERE userid=%s', [actor['user_id']])
    identity = cursor.fetchone() or ()
    owner = bool(inv['createdby'] and inv['createdby'] in (*identity, actor['username']))
    cursor.execute('SELECT roleid FROM tblevaluation WHERE invitationid=%s AND empid=%s ORDER BY evaluationid LIMIT 1',
                   [inv['id'], actor['employee_id']])
    committee = cursor.fetchone()
    flags['_is_owner'] = owner
    flags['_committee_role'] = committee[0] if committee else None
    flags['_is_responsible'] = owner or committee is not None
    return flags


def employee_permission(actor, permission):
    """Check a global employee permission when no invitation exists yet."""
    from api.services.tender_service import TenderService
    if actor['role'] != 'employee':
        raise PermissionDenied('Ажилтны эрх шаардлагатай.')
    result = TenderService.get_permission(actor['employee_id'])
    if result['RetType'] != 0:
        raise PermissionDenied('Эрхийн тохиргоог шалгаж чадсангүй.')
    flags = result['RetData']
    if not (flags.get('isAdmin') or flags.get(permission)):
        raise PermissionDenied('Энэ үйлдлийг хийх эрхгүй байна.')
    return flags


def require_evaluation_access(actor, key, allow_completed=True):
    """Require evaluation permission and membership of this invitation's committee."""
    flags = employee_permission(actor, 'isTenderEvaluate')
    with connection.cursor() as cursor:
        inv = invitation(cursor, key, lock=False)
        cursor.execute(
            'SELECT 1 FROM tblevaluation WHERE invitationid=%s AND empid=%s LIMIT 1',
            [inv['id'], actor['employee_id']],
        )
        if not cursor.fetchone():
            raise PermissionDenied('Та энэ тендерийн үнэлгээний хорооны гишүүн биш байна.')
    allowed_states = {3, 7} if allow_completed else {3}
    if inv['status'] not in allowed_states:
        raise ValidationError('Зөвхөн санал нээсэн эсвэл үр дүн гарсан тендерийн үнэлгээг харна.')
    return flags


def require_bid_document_access(actor, key):
    """Bid documents remain sealed until the deadline and evaluation opening."""
    flags = require_evaluation_access(actor, key)
    with connection.cursor() as cursor:
        inv = invitation(cursor, key, lock=False)
    if not inv['acceptdate'] or timezone.now() < local_datetime(inv['acceptdate']):
        raise ValidationError('Санал хүлээн авах хугацаа дуусаагүй тул баримт бичиг нээгдэхгүй.')
    return flags


def evaluation_invitation_ids(actor):
    """Return evaluable/completed invitations assigned to the signed-in employee."""
    employee_permission(actor, 'isTenderEvaluate')
    with connection.cursor() as cursor:
        cursor.execute(
            '''
            SELECT DISTINCT i.invitationid
            FROM tblinvitation i
            INNER JOIN tblevaluation e ON e.invitationid=i.invitationid
            WHERE e.empid=%s AND i.status IN (3,7)
            ORDER BY i.invitationid DESC
            ''',
            [actor['employee_id']],
        )
        return [row[0] for row in cursor.fetchall()]


def validate_evaluations_complete(cursor, invitation_id):
    """Require one score for every committee member/vendor/criterion combination."""
    cursor.execute(
        '''
        WITH member AS (
            SELECT DISTINCT empid
            FROM tblevaluation
            WHERE invitationid=%s AND empid IS NOT NULL
        ), vendor AS (
            SELECT DISTINCT vendorid
            FROM tblinvitationofvendor
            WHERE invitationid=%s AND status IN (3,4,5) AND vendorid IS NOT NULL
        ), criterion AS (
            SELECT criteriaid
            FROM tblcriteria
            WHERE invitationid=%s
        )
        SELECT
            (SELECT COUNT(*) FROM member),
            (SELECT COUNT(*) FROM vendor),
            (SELECT COUNT(*) FROM criterion),
            COUNT(*) FILTER (
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM tblinvevaluate score
                    WHERE score.invitationid=%s
                      AND score.empid=member.empid
                      AND score.vendorid=vendor.vendorid
                      AND score.criteriaid=criterion.criteriaid
                      AND score.result IS NOT NULL
                )
            )
        FROM member
        CROSS JOIN vendor
        CROSS JOIN criterion
        ''',
        [invitation_id, invitation_id, invitation_id, invitation_id],
    )
    member_count, vendor_count, criterion_count, missing_count = cursor.fetchone()
    if not member_count or not vendor_count or not criterion_count:
        raise ValidationError(
            'Үр дүн гаргахын өмнө үнэлгээний хороо, оролцогч нийлүүлэгч, шалгуур бүрэн байх шаардлагатай.'
        )
    if missing_count:
        raise ValidationError(
            f'Үнэлгээ бүрэн дуусаагүй байна. Хорооны гишүүн, нийлүүлэгч, шалгуурын '
            f'{missing_count} үнэлгээ дутуу байна.'
        )


def committee_payload_changed(invitation_id, members):
    if not isinstance(members, list):
        raise ValidationError('Үнэлгээний хорооны мэдээлэл буруу байна.')
    incoming = []
    for member in members:
        if not isinstance(member, dict):
            raise ValidationError('Үнэлгээний хорооны мэдээлэл буруу байна.')
        role = COMMITTEE_ROLE_IDS.get(member.get('role'))
        if role is None:
            raise ValidationError('Үнэлгээний хорооны гишүүний үүрэг буруу байна.')
        incoming.append((positive_id(member.get('empid')), role))
    if len(incoming) != len({empid for empid, _ in incoming}):
        raise ValidationError('Үнэлгээний хорооны гишүүн давхардсан байна.')
    if not invitation_id:
        return bool(incoming)
    with connection.cursor() as cursor:
        cursor.execute(
            'SELECT empid,roleid FROM tblevaluation WHERE invitationid=%s ORDER BY empid,roleid',
            [positive_id(invitation_id)],
        )
        existing = cursor.fetchall()
    return sorted(incoming) != existing


def action_allowed(action, flags):
    if flags.get('isAdmin'):
        return True
    policy = RULES[action][2]
    if policy == 'manage_responsible':
        return bool(flags.get('isTenderManage') and flags.get('_is_responsible'))
    if policy == 'committee_open':
        return flags.get('_committee_role') in {1, 2}
    if policy == 'committee_chair':
        return flags.get('_committee_role') == 1
    return bool(flags.get(policy))


def check_transition(state, action, flags):
    if action not in RULES:
        raise ValidationError('Үйлдэл буруу байна.')
    sources, target, _ = RULES[action]
    if not action_allowed(action, flags):
        raise PermissionDenied('Энэ үйлдлийг хийх эрхгүй байна.')
    if state not in sources:
        raise ValidationError('Төлөв өөрчлөгдсөн эсвэл энэ төлөвөөс үйлдэл хийх боломжгүй. Хуудсаа шинэчилнэ үү.')
    return target


def validate_publish(cursor, inv):
    accept, opening = local_datetime(inv['acceptdate']), local_datetime(inv['opendate'])
    if not accept or not opening or accept <= timezone.now() or opening <= accept:
        raise ValidationError('Санал авах хугацаа ирээдүйд, санал нээх хугацаа түүнээс хойш байх ёстой.')
    cursor.execute(
        '''
        SELECT
            t.tendername,
            t.budget,
            EXISTS (
                SELECT 1
                FROM tender_activity_relation relation
                INNER JOIN tblvendoractivity activity
                    ON activity.activityid=relation.activityid
                WHERE relation.tenderid=t.tenderid
                  AND BTRIM(COALESCE(activity.activity, ''))<>''
            )
        FROM tbltender t
        WHERE t.tenderid=%s
        ''',
        [inv['tenderid']],
    )
    tender = cursor.fetchone()
    if not tender or not tender[0] or not tender[0].strip() or not tender[1] or tender[1] <= 0:
        raise ValidationError('Тендерийн нэр, төсөв шаардлагатай.')
    if not tender[2]:
        raise ValidationError('Тендерийн үйл ажиллагааны чиглэлийг сонгоно уу.')
    cursor.execute(
        """
        SELECT
            COUNT(*),
            COALESCE(SUM(
                CASE
                    WHEN BTRIM(COALESCE(weight::text, '')) ~ '^[0-9]+([.][0-9]+)?$'
                    THEN BTRIM(weight::text)::numeric
                    ELSE 0
                END
            ), 0),
            COUNT(*) FILTER (
                WHERE NOT (
                    BTRIM(COALESCE(weight::text, '')) ~ '^[0-9]+([.][0-9]+)?$'
                )
            )
        FROM tblcriteria
        WHERE invitationid=%s
        """,
        [inv['id']],
    )
    count, weight, invalid_weight_count = cursor.fetchone()
    if not count or invalid_weight_count or weight != 100:
        raise ValidationError('Шалгуурын нийт жин 100% байх ёстой.')
    for table, column, value in [('tblrequire', 'invitationid', inv['id']),
                                  ('tbltenderbatch', 'tenderid', inv['tenderid'])]:
        cursor.execute(f'SELECT 1 FROM {table} WHERE {column}=%s LIMIT 1', [value])
        if not cursor.fetchone():
            raise ValidationError('Багц болон шаардлагыг бүрэн оруулна уу.')
    cursor.execute(
        '''
        SELECT
            COUNT(*) FILTER (WHERE budget IS NULL OR budget<=0),
            COALESCE(SUM(budget), 0)
        FROM tbltenderbatch
        WHERE tenderid=%s
        ''',
        [inv['tenderid']],
    )
    invalid_batch_count, batch_budget_total = cursor.fetchone()
    if invalid_batch_count:
        raise ValidationError('Багц бүрийн төсөвт үнийг 0-ээс их дүнгээр оруулна уу.')
    if batch_budget_total != tender[1]:
        raise ValidationError('Багцуудын нийт төсөв тендерийн нийт төсөвтэй тэнцүү байх ёстой.')
    cursor.execute('SELECT roleid FROM tblevaluation WHERE invitationid=%s', [inv['id']])
    if not {1, 2, 4}.issubset({r[0] for r in cursor.fetchall()}):
        raise ValidationError('Дарга, нарийн бичиг, дотоод хяналтын гишүүд шаардлагатай.')


def clone_rows(cursor, table, key, old, overrides):
    """Copy only known invitation child tables; omit generated primary keys."""
    pk = connection.introspection.get_primary_key_column(cursor, table)
    if pk is None:
        # The migrated legacy schema has sequences but no PK constraints, so
        # PostgreSQL introspection cannot identify these generated ID columns.
        pk = LEGACY_PRIMARY_KEYS.get(table.lower())
    if pk is None:
        raise RuntimeError(f'Primary key metadata is missing for {table}.')
    columns = [c.name for c in connection.introspection.get_table_description(cursor, table) if c.name != pk]
    q = connection.ops.quote_name
    expressions = ['%s' if c in overrides else q(c) for c in columns]
    params = [overrides[c] for c in columns if c in overrides]
    cursor.execute(f'SELECT {q(pk)} FROM {q(table)} WHERE {q(key)}=%s ORDER BY {q(pk)}', [old])
    ids = [r[0] for r in cursor.fetchall()]
    copied = []
    for old_id in ids:
        cursor.execute(f'INSERT INTO {q(table)} ({",".join(map(q,columns))}) '
                       f'SELECT {",".join(expressions)} FROM {q(table)} WHERE {q(pk)}=%s RETURNING {q(pk)}',
                       params + [old_id])
        copied.append((old_id, cursor.fetchone()[0]))
    return copied


def next_reissue_tender_code(cursor, source_code):
    """Create a traceable code when a tender type has no legacy counter row."""
    source_code = str(source_code or '').strip()
    if not source_code:
        raise ValidationError('Эх тендерийн код хоосон тул дахин зарлах код үүсгэх боломжгүй байна.')

    base_code = re.sub(r'-R\d+$', '', source_code, flags=re.IGNORECASE)
    cursor.execute(
        'SELECT tendercode FROM tbltender WHERE tendercode=%s OR tendercode LIKE %s FOR UPDATE',
        [base_code, f'{base_code}-R%'],
    )
    suffix_pattern = re.compile(rf'^{re.escape(base_code)}-R(\d+)$', re.IGNORECASE)
    sequence = 0
    for (existing_code,) in cursor.fetchall():
        match = suffix_pattern.fullmatch(str(existing_code or '').strip())
        if match:
            sequence = max(sequence, int(match.group(1)))

    suffix = f'-R{sequence + 1}'
    # tbltender.tendercode is varchar(100) in the legacy schema.
    return f'{base_code[:100 - len(suffix)]}{suffix}'


@transaction.atomic
def transition(actor, data):
    if not isinstance(data, dict):
        raise ValidationError('Хүсэлтийг JSON object хэлбэрээр илгээнэ үү.')
    with connection.cursor() as cursor:
        inv = invitation(cursor, data.get('invitationid'))
        flags = employee_access(cursor, actor, inv)
        action = data.get('action')
        if not isinstance(action, str):
            raise ValidationError('Үйлдэл буруу байна.')
        target = check_transition(inv['status'], action, flags)
        note = str(data.get('note') or '').strip()
        if len(note) > 500:
            raise ValidationError('Тайлбар 500 тэмдэгтээс хэтэрч болохгүй.')
        if action == 'cancel' and not note:
            raise ValidationError('Тендер цуцлах шалтгаан, тайлбар оруулна уу.')
        if action in {'request_publish', 'publish'}:
            validate_publish(cursor, inv)
        if action == 'publish':
            cursor.execute('UPDATE tbltender SET publishdate=CURRENT_DATE WHERE tenderid=%s', [inv['tenderid']])
        if action == 'open':
            if not inv['opendate'] or timezone.now() < local_datetime(inv['opendate']):
                raise ValidationError('Санал нээх хугацаа болоогүй байна.')
            cursor.execute('SELECT 1 FROM tblinvitationofvendor WHERE invitationid=%s AND status=2 LIMIT 1', [inv['id']])
            if not cursor.fetchone():
                raise ValidationError('Илгээсэн санал байхгүй. Шалтгаантай цуцалж дахин зарлаж болно.')
            cursor.execute('UPDATE tblinvitationofvendor SET status=3 WHERE invitationid=%s AND status=2', [inv['id']])
            cursor.execute('UPDATE tblinvitation SET openby=%s WHERE invitationid=%s', [actor['username'], inv['id']])
        if action == 'decide':
            decision = data.get('decision', data.get('status'))
            if decision not in (4, 5):
                raise ValidationError('Шийдвэр 4 эсвэл 5 байна.')
            cursor.execute('UPDATE tblinvitationofvendor SET status=%s,note=%s,updated=%s '
                           'WHERE invitationid=%s AND vendorid=%s AND status IN (3,4,5)',
                           [decision, note, timezone.now().isoformat(), inv['id'], positive_id(data.get('vendorid'))])
            if not cursor.rowcount:
                raise ValidationError('Үнэлэх нийлүүлэгч олдсонгүй.')
            return {'invitationid': inv['id'], 'status': inv['status']}
        if action == 'finish':
            cursor.execute('SELECT status FROM tblinvitationofvendor WHERE invitationid=%s AND status<>0', [inv['id']])
            states = [r[0] for r in cursor.fetchall()]
            if not states or any(s not in (4, 5) for s in states) or 5 not in states:
                raise ValidationError('Бүх нийлүүлэгчийн эцсийн шийдвэр болон багадаа нэг шалгарсан нийлүүлэгч шаардлагатай.')
            validate_evaluations_complete(cursor, inv['id'])
        if action == 'cancel':
            cursor.execute('UPDATE tblinvitation SET rejectby=%s,rejectnote=%s WHERE invitationid=%s',
                           [actor['username'], note, inv['id']])
        if action == 'request_republish':
            cursor.execute('UPDATE tblinvitation SET republish_origin_status=status WHERE invitationid=%s', [inv['id']])
        if action == 'return_republish':
            if inv['origin'] not in (7, 8):
                raise ValidationError('Хуучин хүсэлтийн эх төлөв бүртгэгдээгүй байна.')
            target = inv['origin']
        if action == 'extend':
            accept, opening = local_datetime(data.get('acceptdate')), local_datetime(data.get('opendate'))
            if not inv['acceptdate'] or timezone.now() >= local_datetime(inv['acceptdate']):
                raise ValidationError('Санал авах хугацаа дууссан тул сунгах боломжгүй.')
            if not accept or not opening or accept <= local_datetime(inv['acceptdate']) or opening <= accept:
                raise ValidationError('Шинэ хугацаа өмнөхөөс хойш, нээх хугацаа түүнээс хойш байна.')
            cursor.execute('UPDATE tblinvitation SET acceptdate=%s,opendate=%s,delaynote=%s,delayedby=%s WHERE invitationid=%s',
                           [accept, opening, note, actor['username'], inv['id']])
        result = {'invitationid': inv['id'], 'status': target}
        if action == 'republish':
            # A fresh draft has no submissions, outcomes or inherited deadlines.
            from api.utils.mime_types import getNextCode
            cursor.execute(
                'SELECT departmentid,tendertypeid,tendercode FROM tbltender WHERE tenderid=%s FOR UPDATE',
                [inv['tenderid']],
            )
            department, tender_type, source_tender_code = cursor.fetchone()
            tender_code, invitation_code = getNextCode(1, tender_type, department), getNextCode(2, 0, department)
            if not tender_code:
                tender_code = next_reissue_tender_code(cursor, source_tender_code)
            if not invitation_code:
                raise ValidationError('Шинэ урилгын код үүсгэх тохиргоо дутуу байна.')
            draft_owner = inv['createdby'] or actor['username']
            # Header and batches must also be versioned: editing the new round
            # must not rewrite the original tender's name, budget or quote batches.
            new_tender = clone_rows(cursor, 'tbltender', 'tenderid', inv['tenderid'], {
                'tendercode': tender_code, 'publishdate': None, 'startdate': None,
                'enddate': None, 'evaluationdate': None, 'plandate': None,
                'createdby': draft_owner,
            })[0][1]
            cursor.execute(
                'INSERT INTO tender_activity_relation(tenderid,activityid) '
                'SELECT %s,activityid FROM tender_activity_relation WHERE tenderid=%s '
                'ON CONFLICT (tenderid,activityid) DO NOTHING',
                [new_tender, inv['tenderid']],
            )
            batches = dict(clone_rows(cursor, 'tbltenderbatch', 'tenderid', inv['tenderid'], {'tenderid': new_tender}))
            cursor.execute('INSERT INTO tblinvitation(tenderid,status,invitationcode,createdby,created,reissued_from_invitationid) '
                           'VALUES (%s,0,%s,%s,%s,%s) RETURNING invitationid',
                           [new_tender, invitation_code, draft_owner, timezone.now(), inv['id']])
            new_id = cursor.fetchone()[0]
            for table in ('tblrequire', 'tblcriteria', 'tblevaluation', 'tblnotes'):
                clone_rows(cursor, table, 'invitationid', inv['id'], {'invitationid': new_id})
            documents = clone_rows(cursor, 'tbltenderdoc', 'invitationid', inv['id'], {'invitationid': new_id, 'tenderid': new_tender})
            for old_batch, new_batch in batches.items():
                cursor.execute('UPDATE tbltenderdoc SET batchid=%s WHERE invitationid=%s AND batchid=%s', [new_batch, new_id, old_batch])
            for old_doc, new_doc in documents:
                # Avoid copying unrelated attachments with coincident numeric IDs.
                cursor.execute("SELECT fileid FROM tblfiles WHERE sourceid=%s AND sourcetype='TenderDoc'", [old_doc])
                for (file_id,) in cursor.fetchall():
                    clone_rows(cursor, 'tblfiles', 'fileid', file_id, {'sourceid': new_doc})
            result['new_invitationid'] = new_id
        # The invitation note is tender content, not a workflow reason. Keep it
        # unchanged; cancellation reason is stored separately in rejectnote.
        cursor.execute('UPDATE tblinvitation SET status=%s WHERE invitationid=%s', [target, inv['id']])
        if action == 'publish':
            recipient_count = queue_activity_invitations(cursor, inv['id'], inv['tenderid'])
            result['notification_recipient_count'] = recipient_count
            # TEMPORARILY DISABLED: do not send supplier invitation emails on publish.
            # Recipient snapshots are still queued so this can be restored later.
            # transaction.on_commit(
            #     lambda invitation_id=inv['id']: send_pending_invitation_emails(invitation_id),
            #     robust=True,
            # )
        return result


def workflow(actor, key):
    with connection.cursor() as cursor:
        inv = invitation(cursor, key, lock=False)
        flags = employee_access(cursor, actor, inv)
        actions = [
            action
            for action, (sources, _, _) in RULES.items()
            if inv['status'] in sources and action_allowed(action, flags)
        ]
        identities_sealed = inv['status'] == 1
        submission_summary = None
        if identities_sealed:
            cursor.execute(
                '''
                SELECT
                    batch.batchid,
                    COALESCE(batch.batchcode, ''),
                    COALESCE(batch.batchname, ''),
                    COUNT(DISTINCT quote.vendorid)
                FROM tbltenderbatch batch
                LEFT JOIN tblqoute quote
                    ON quote.batchid=batch.batchid
                   AND quote.invitationid=%s
                WHERE batch.tenderid=%s
                GROUP BY batch.batchid,batch.batchcode,batch.batchname
                ORDER BY batch.batchid
                ''',
                [inv['id'], inv['tenderid']],
            )
            batches = [
                dict(zip(('batchid', 'code', 'name', 'companyCount'), row))
                for row in cursor.fetchall()
            ]
            cursor.execute(
                'SELECT COUNT(DISTINCT vendorid) FROM tblqoute WHERE invitationid=%s',
                [inv['id']],
            )
            submission_summary = {
                'totalCompanies': cursor.fetchone()[0],
                'batches': batches,
            }
            # Supplier identities remain sealed until the explicit open action.
            vendors = []
        else:
            cursor.execute(
                'SELECT p.vendorid,v.vendorname,p.status,p.note FROM tblinvitationofvendor p '
                'JOIN tblvendor v ON v.vendorid=p.vendorid '
                'WHERE p.invitationid=%s ORDER BY v.vendorname',
                [inv['id']],
            )
            vendors = [
                dict(zip(('vendorid', 'name', 'status', 'note'), row))
                for row in cursor.fetchall()
            ]
        return {'status': inv['status'], 'label': LABELS.get(inv['status'], 'Хуучин төлөв'),
                'actions': actions, 'editable': inv['status'] == 0, 'vendors': vendors,
                'identitiesSealed': identities_sealed, 'submissionSummary': submission_summary,
                'acceptdate': inv['acceptdate'], 'opendate': inv['opendate']}


def require_draft(actor, key, permission='isTenderManage'):
    with connection.cursor() as cursor:
        inv = invitation(cursor, key)
        flags = employee_access(cursor, actor, inv)
        permitted = flags.get('isAdmin') or flags.get(permission)
        if permission == 'isTenderManage':
            permitted = permitted and (flags.get('isAdmin') or flags.get('_is_responsible'))
        if not permitted:
            raise PermissionDenied('Энэ үйлдлийг хийх эрхгүй байна.')
        if inv['status'] != 0:
            raise ValidationError('Зөвхөн ноорог тендерийн мэдээллийг засаж болно.')
        return inv


def require_submission(actor, key, vendor_id):
    with connection.cursor() as cursor:
        inv = invitation(cursor, key)
        if actor['role'] != 'vendor' or actor['vendor_id'] != positive_id(vendor_id):
            raise PermissionDenied('Зөвхөн өөрийн байгууллагын санал илгээнэ үү.')
        if inv['status'] != 1 or not inv['acceptdate'] or timezone.now() >= local_datetime(inv['acceptdate']):
            raise ValidationError('Санал хүлээн авах хугацаа дууссан эсвэл тендер нээлттэй биш байна.')
        return inv


def guard_mutation(request, route, path_values=None):
    """Use the same locks for form edits, submissions and lifecycle transitions."""
    import json
    actor = request.audit_actor
    try:
        data = json.loads(request.body) if request.content_type == 'application/json' else (request.POST if request.method == 'POST' else request.GET)
    except (ValueError, UnicodeDecodeError):
        raise ValidationError('Хүсэлтийн бүтэц буруу байна.')
    if isinstance(data, list) and route == 'evaMembers/save/':
        invitation_ids = {row.get('invitationid') for row in data if isinstance(row, dict)}
        if not data or len(invitation_ids) != 1:
            raise ValidationError('Хорооны гишүүд нэг тендерийн урилгад хамаарах ёстой.')
        require_draft(actor, invitation_ids.pop(), 'isCommitteeManage')
        return
    if not isinstance(data, dict):
        return
    data = {**data, **(path_values or {})} if request.content_type == 'application/json' else {**data.dict(), **(path_values or {})}
    endpoint = route.strip('/').split('/')[-1]
    if endpoint == 'savePortalTender':
        header, details = data.get('header', {}), data.get('details', {})
        if not isinstance(header, dict) or not isinstance(details, dict):
            raise ValidationError('Тендерийн мэдээлэл буруу байна.')
        flags = employee_permission(actor, 'isTenderManage')
        request.tender_permission_flags = flags
        if not (flags.get('isAdmin') or flags.get('isCommitteeManage')):
            if committee_payload_changed(details.get('invitationid'), details.get('members', [])):
                raise PermissionDenied('Үнэлгээний хороо бүрдүүлэх эрхгүй байна.')
        if header.get('tenderid'):
            inv = require_draft(actor, details.get('invitationid'))
            if inv['tenderid'] != positive_id(header.get('tenderid')):
                raise ValidationError('Тендер, урилга тохирохгүй байна.')
    elif endpoint in {'saveTender', 'saveInvitationHeader'}:
        employee_permission(actor, 'isTenderManage')
        if data.get('tenderid'):
            with connection.cursor() as cursor:
                cursor.execute('SELECT invitationid FROM tblinvitation WHERE tenderid=%s ORDER BY invitationid', [data['tenderid']])
                keys = [r[0] for r in cursor.fetchall()]
            for key in keys:
                require_draft(actor, key)
    elif endpoint == 'saveTenderCommittee':
        members = data.get('members')
        if not isinstance(members, list):
            raise ValidationError('Үнэлгээний хорооны мэдээлэл буруу байна.')
        require_draft(actor, data.get('invitationid'), 'isCommitteeManage')
        committee_payload_changed(data.get('invitationid'), members)
    elif endpoint in {'saveTenderDraftDetails', 'uploadTenderDocument'}:
        flags = employee_permission(actor, 'isTenderManage')
        request.tender_permission_flags = flags
        inv = require_draft(actor, data.get('invitationid'))
        if positive_id(data.get('tenderid')) != inv['tenderid']:
            raise ValidationError('Тендер, урилга тохирохгүй байна.')
        if endpoint == 'saveTenderDraftDetails' and not (
            flags.get('isAdmin') or flags.get('isCommitteeManage')
        ):
            if committee_payload_changed(data.get('invitationid'), data.get('members', [])):
                raise PermissionDenied('Үнэлгээний хороо бүрдүүлэх эрхгүй байна.')
    elif endpoint in {'insertInvitationOfTender', 'uploadTenderJoinDocument'} or route == 'quote/save/':
        inv = require_submission(actor, data.get('invitationid') or data.get('invitation_id'),
                                 data.get('vendorid') or data.get('vendor_id'))
        if positive_id(data.get('tenderid') or data.get('tender_id')) != inv['tenderid']:
            raise ValidationError('Тендер, урилга тохирохгүй байна.')
        if route == 'quote/save/' and data.get('qouteid'):
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1 FROM tblqoute WHERE qouteid=%s AND invitationid=%s AND vendorid=%s',
                               [positive_id(data['qouteid']), inv['id'], actor['vendor_id']])
                if not cursor.fetchone():
                    raise PermissionDenied('Энэ үнийн саналыг засах эрхгүй байна.')
        if route == 'quote/save/':
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT 1 FROM tblrequire WHERE invitationid=%s AND COALESCE(document_required, TRUE) IS TRUE LIMIT 1',
                    [inv['id']],
                )
                if cursor.fetchone():
                    cursor.execute(
                        '''
                        SELECT DISTINCT requiretypeid
                        FROM tbltenderjoindoc
                        WHERE invitationid=%s AND vendorid=%s
                          AND requiretypeid = ANY(%s)
                        ''',
                        [inv['id'], actor['vendor_id'], list(REQUIRED_VENDOR_DOCUMENT_TYPE_IDS)],
                    )
                    uploaded = {row[0] for row in cursor.fetchall()}
                    if set(REQUIRED_VENDOR_DOCUMENT_TYPE_IDS) - uploaded:
                        raise ValidationError('Стандарт баримт бичгийн бүрдүүлэлт дутуу байна.')
    elif endpoint == 'deleteFile':
        kind = data.get('sourcetype')
        table = {'TenderDoc': 'tbltenderdoc', 'TenderJoinDoc': 'tbltenderjoindoc'}.get(kind)
        if table:
            with connection.cursor() as cursor:
                pk = connection.introspection.get_primary_key_column(cursor, table)
                extra = ',vendorid' if kind == 'TenderJoinDoc' else ''
                cursor.execute(f'SELECT invitationid{extra} FROM {table} WHERE {connection.ops.quote_name(pk)}=%s', [positive_id(data.get('sourceid'))])
                row = cursor.fetchone()
                if not row: raise NotFound('Баримт олдсонгүй.')
                if kind == 'TenderDoc': require_draft(actor, row[0])
                else: require_submission(actor, row[0], row[1])
    elif route.startswith('quote/delete/'):
        with connection.cursor() as cursor:
            cursor.execute('SELECT invitationid,vendorid FROM tblqoute WHERE qouteid=%s', [positive_id(data.get('qouteid'))])
            row = cursor.fetchone()
            if not row: raise NotFound('Үнийн санал олдсонгүй.')
            require_submission(actor, row[0], row[1])
    elif route.startswith(('criteria/', 'require/', 'note/', 'evaMembers/')) and ('/save/' in route or '/delete/' in route):
        if route.startswith('note/') and data.get('joinworkid') and not data.get('invitationid'):
            return
        table, pk = {'criteria': ('tblcriteria', 'criteriaid'), 'require': ('tblrequire', 'requireid'),
                     'note': ('tblnotes', 'noteid'), 'evaMembers': ('tblevaluation', 'evaluationid')}[route.split('/')[0]]
        key = data.get('invitationid')
        record_id = data.get(pk)
        if record_id:
            with connection.cursor() as cursor:
                cursor.execute(f'SELECT invitationid FROM {table} WHERE {pk}=%s', [record_id])
                row = cursor.fetchone()
                if not row: raise NotFound('Мэдээлэл олдсонгүй.')
                if key and positive_id(key) != row[0]: raise ValidationError('Урилга тохирохгүй байна.')
                key = row[0]
        permission = 'isCommitteeManage' if route.startswith('evaMembers/') else 'isTenderManage'
        require_draft(actor, key, permission)
    elif endpoint == 'evalueteInvitationOfVendor':
        rows = data.get('param', [])
        if not rows:
            raise ValidationError('Үнэлгээ оруулна уу.')
        keys = {(r.get('invitationid'), r.get('vendorid')) for r in rows}
        if len(keys) != 1 or positive_id(data.get('empid')) != actor['employee_id']:
            raise PermissionDenied('Өөрийн үнэлгээг нэг нийлүүлэгчээр хадгална уу.')
        key, vendor = next(iter(keys))
        require_evaluation_access(actor, key, allow_completed=False)
        with connection.cursor() as cursor:
            inv = invitation(cursor, key)
            if inv['status'] != 3:
                raise ValidationError('Зөвхөн санал нээсэн тендерийг үнэлнэ.')
            cursor.execute('SELECT 1 FROM tblinvitationofvendor WHERE invitationid=%s AND vendorid=%s AND status IN (3,4,5)', [key, vendor])
            if not cursor.fetchone():
                raise ValidationError('Оролцогч олдсонгүй.')
            criteria = [positive_id(r.get('criteriaid')) for r in rows]
            if len(criteria) != len(set(criteria)):
                raise ValidationError('Шалгуур давхардсан байна.')
            cursor.execute('SELECT criteriaid FROM tblcriteria WHERE invitationid=%s', [key])
            if not set(criteria).issubset({r[0] for r in cursor.fetchall()}):
                raise ValidationError('Шалгуур энэ урилгад хамаарахгүй байна.')
    elif route.startswith('maktender/deleteTender/'):
        employee_permission(actor, 'isTenderManage')
