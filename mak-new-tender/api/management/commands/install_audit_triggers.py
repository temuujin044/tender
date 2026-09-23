"""Reattach audit triggers after restoring the separately managed legacy tables."""
from importlib import import_module

from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Install business audit triggers on existing legacy tables (run after a database restore)."

    def handle(self, *args, **options):
        migration = import_module("api.migrations.0002_business_audit")
        with connection.schema_editor() as editor:
            migration.install_triggers(apps, editor)
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT c.relname FROM pg_trigger t
                JOIN pg_class c ON c.oid = t.tgrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE t.tgname = 'business_audit' AND n.nspname = current_schema()
                ORDER BY c.relname
            """)
            installed = {row[0] for row in cursor.fetchall()}
        self.stdout.write(self.style.SUCCESS(f"Audit enabled for {len(installed)} business tables."))
        missing = sorted(set(migration.TABLES) - installed)
        if missing:
            self.stdout.write("Tables not present in this database: " + ", ".join(missing))
