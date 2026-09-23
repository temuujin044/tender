from django.core.management.base import BaseCommand

from api.models import TenderInvitationRecipient
from api.services.activity_matching_service import send_pending_invitation_emails


class Command(BaseCommand):
    help = 'Queued болон түр алдаатай тендерийн урилгын email-үүдийг илгээнэ.'

    def add_arguments(self, parser):
        parser.add_argument('--invitation-id', type=int)

    def handle(self, *args, **options):
        invitation_id = options.get('invitation_id')
        if invitation_id:
            invitation_ids = [invitation_id]
        else:
            invitation_ids = list(
                TenderInvitationRecipient.objects.filter(
                    delivery_status__in=['queued', 'failed'],
                    attempt_count__lt=5,
                )
                .order_by('invitationid')
                .values_list('invitationid', flat=True)
                .distinct()
            )

        sent = failed = 0
        for current_id in invitation_ids:
            result = send_pending_invitation_emails(current_id, include_failed=True)
            sent += result['sent']
            failed += result['failed']

        self.stdout.write(self.style.SUCCESS(f'Илгээсэн: {sent}, алдаатай: {failed}'))
