from django.core.management.base import BaseCommand
from api.models import TenderEvaluationStatus


STATUSES = [
    ("NOT_STARTED", "Шалгаруулалт эхлээгүй"),
    ("STAGE_1", "1-р шатны шалгаруулалт"),
    ("STAGE_2", "2-р шатны шалгаруулалт"),
    ("SELECTED", "Шалгарсан"),
    ("NOT_SELECTED", "Шалгараагүй"),
    ("COMPLETED", "Шалгаруулалт дууссан"),
]


class Command(BaseCommand):
    help = "Create tender evaluation statuses"

    def handle(self, *args, **options):
        for code, name in STATUSES:
            status, created = TenderEvaluationStatus.objects.get_or_create(
                code=code,
                defaults={"name": name},
            )

            if created:
                self.stdout.write(
                    self.style.SUCCESS(f"Created: {code}")
                )
            else:
                self.stdout.write(f"Already exists: {code}")