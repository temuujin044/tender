import json
from html import escape

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.db import connection
from django.utils import timezone

from api.models import TenderInvitationRecipient


def normalize_activity_ids(cursor, raw_value, *, required=True):
    values = raw_value if isinstance(raw_value, (list, tuple)) else [raw_value]
    activity_ids = []
    for value in values:
        if value in (None, '', 0, '0'):
            continue
        if isinstance(value, bool):
            raise ValueError('Үйл ажиллагааны чиглэлийн мэдээлэл буруу байна.')
        try:
            activity_id = int(value)
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError('Үйл ажиллагааны чиглэлийн мэдээлэл буруу байна.') from exc
        if activity_id <= 0:
            raise ValueError('Үйл ажиллагааны чиглэлийн мэдээлэл буруу байна.')
        if activity_id not in activity_ids:
            activity_ids.append(activity_id)

    if required and not activity_ids:
        raise ValueError('Үйл ажиллагааны чиглэлээ сонгоно уу.')
    if not activity_ids:
        return []

    placeholders = ','.join(['%s'] * len(activity_ids))
    cursor.execute(
        f'''
        SELECT activityid
        FROM tblvendoractivity
        WHERE activityid IN ({placeholders})
          AND BTRIM(COALESCE(activity, ''))<>''
        ''',
        activity_ids,
    )
    found = {row[0] for row in cursor.fetchall()}
    if found != set(activity_ids):
        raise ValueError('Сонгосон үйл ажиллагааны чиглэл олдсонгүй.')
    return activity_ids


def sync_vendor_activities(cursor, vendor_id, activity_ids):
    cursor.execute('DELETE FROM vendor_activity_relation WHERE vendorid=%s', [vendor_id])
    cursor.executemany(
        '''
        INSERT INTO vendor_activity_relation(vendorid, activityid)
        VALUES (%s, %s)
        ON CONFLICT (vendorid, activityid) DO NOTHING
        ''',
        [(vendor_id, activity_id) for activity_id in activity_ids],
    )


def sync_tender_activities(cursor, tender_id, activity_ids):
    cursor.execute('DELETE FROM tender_activity_relation WHERE tenderid=%s', [tender_id])
    cursor.executemany(
        '''
        INSERT INTO tender_activity_relation(tenderid, activityid)
        VALUES (%s, %s)
        ON CONFLICT (tenderid, activityid) DO NOTHING
        ''',
        [(tender_id, activity_id) for activity_id in activity_ids],
    )


def activity_names(cursor, activity_ids):
    if not activity_ids:
        return []
    placeholders = ','.join(['%s'] * len(activity_ids))
    cursor.execute(
        f'SELECT activityid, BTRIM(activity) FROM tblvendoractivity WHERE activityid IN ({placeholders})',
        activity_ids,
    )
    names = dict(cursor.fetchall())
    return [names[activity_id] for activity_id in activity_ids if activity_id in names]


def queue_activity_invitations(cursor, invitation_id, tender_id):
    cursor.execute(
        '''
        SELECT
            v.vendorid,
            COALESCE(BTRIM(v.vendorname), ''),
            COALESCE(NULLIF(BTRIM(v.vendoremail), ''), NULLIF(BTRIM(v.empemail), '')),
            ARRAY_AGG(DISTINCT vendor_activity.activityid ORDER BY vendor_activity.activityid)
        FROM tblvendor v
        INNER JOIN vendor_activity_relation vendor_activity
            ON vendor_activity.vendorid=v.vendorid
        INNER JOIN tender_activity_relation tender_activity
            ON tender_activity.activityid=vendor_activity.activityid
           AND tender_activity.tenderid=%s
        WHERE COALESCE(v.vendorstatusid, 0)=1
          AND COALESCE(NULLIF(BTRIM(v.vendoremail), ''), NULLIF(BTRIM(v.empemail), '')) IS NOT NULL
        GROUP BY v.vendorid, v.vendorname, v.vendoremail, v.empemail
        ''',
        [tender_id],
    )
    recipients = cursor.fetchall()
    queued = 0
    for vendor_id, vendor_name, email, matched_activity_ids in recipients:
        cursor.execute(
            '''
            INSERT INTO tender_invitation_recipient(
                invitationid, tenderid, vendorid, vendorname, email,
                matched_activity_ids, delivery_status, attempt_count,
                queued_at, sent_at, last_error
            )
            VALUES (%s,%s,%s,%s,%s,%s::jsonb,'queued',0,%s,NULL,'')
            ON CONFLICT (invitationid, vendorid) DO NOTHING
            ''',
            [
                invitation_id,
                tender_id,
                vendor_id,
                vendor_name,
                email,
                json.dumps(list(matched_activity_ids)),
                timezone.now(),
            ],
        )
        queued += cursor.rowcount
    return queued


def send_pending_invitation_emails(invitation_id, *, include_failed=False):
    statuses = ['queued', 'failed'] if include_failed else ['queued']
    recipients = list(
        TenderInvitationRecipient.objects.filter(
            invitationid=invitation_id,
            delivery_status__in=statuses,
            attempt_count__lt=5,
        ).order_by('id')
    )
    if not recipients:
        return {'sent': 0, 'failed': 0}

    with connection.cursor() as cursor:
        cursor.execute(
            '''
            SELECT t.tendername, i.invitationcode, i.acceptdate
            FROM tblinvitation i
            INNER JOIN tbltender t ON t.tenderid=i.tenderid
            WHERE i.invitationid=%s AND i.status=1
            ''',
            [invitation_id],
        )
        invitation = cursor.fetchone()
    if not invitation:
        return {'sent': 0, 'failed': 0}

    tender_name, invitation_code, accept_date = invitation
    public_url = getattr(settings, 'TENDER_PUBLIC_URL', 'http://127.0.0.1:3000').rstrip('/')
    tender_url = f'{public_url}/tenders/{invitation_id}'
    subject = f'Шинэ тендерийн урилга: {tender_name}'
    sent = failed = 0
    mail_connection = get_connection()
    try:
        mail_connection.open()
    except Exception as exc:
        error = str(exc)[:2000]
        for recipient in recipients:
            recipient.attempt_count += 1
            recipient.delivery_status = 'failed'
            recipient.last_error = error
            recipient.save(update_fields=['attempt_count', 'delivery_status', 'last_error'])
        return {'sent': 0, 'failed': len(recipients)}

    try:
        for recipient in recipients:
            recipient.attempt_count += 1
            try:
                plain_text = (
                    f'{recipient.vendorname or "Нийлүүлэгч"} танд шинэ тендерийн урилга ирлээ.\n\n'
                    f'Тендер: {tender_name}\n'
                    f'Урилгын код: {invitation_code or "-"}\n'
                    f'Санал авах эцсийн хугацаа: {accept_date or "-"}\n'
                    f'Дэлгэрэнгүй: {tender_url}'
                )
                html = (
                    f'<p>{escape(recipient.vendorname or "Нийлүүлэгч")} танд шинэ тендерийн урилга ирлээ.</p>'
                    f'<p><strong>Тендер:</strong> {escape(str(tender_name))}<br>'
                    f'<strong>Урилгын код:</strong> {escape(str(invitation_code or "-"))}<br>'
                    f'<strong>Санал авах эцсийн хугацаа:</strong> {escape(str(accept_date or "-"))}</p>'
                    f'<p><a href="{tender_url}">Тендерийн дэлгэрэнгүй харах</a></p>'
                )
                message = EmailMultiAlternatives(
                    subject=subject,
                    body=plain_text,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    to=[recipient.email],
                    connection=mail_connection,
                )
                message.attach_alternative(html, 'text/html')
                message.send(fail_silently=False)
                recipient.delivery_status = 'sent'
                recipient.sent_at = timezone.now()
                recipient.last_error = ''
                sent += 1
            except Exception as exc:
                recipient.delivery_status = 'failed'
                recipient.last_error = str(exc)[:2000]
                failed += 1
            recipient.save(
                update_fields=[
                    'attempt_count',
                    'delivery_status',
                    'sent_at',
                    'last_error',
                ]
            )
    finally:
        try:
            mail_connection.close()
        except Exception:
            pass
    return {'sent': sent, 'failed': failed}
