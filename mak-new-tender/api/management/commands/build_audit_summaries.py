from django.core.management.base import BaseCommand
from django.db import transaction
from api.models import AuditEvent
from api.services.audit_summary import create_summary


class Command(BaseCommand):
    help = 'Create missing display summaries without changing any raw audit records.'

    def handle(self, *args, **options):
        count = 0
        for event in AuditEvent.objects.filter(summary__isnull=True).order_by('id').iterator(chunk_size=100):
            with transaction.atomic():
                create_summary(event, historical=True)
            count += 1
        self.stdout.write(self.style.SUCCESS(f'Created {count} display summaries. Raw audit records preserved.'))
