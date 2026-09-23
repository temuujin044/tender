from django.db import migrations


def normalize_draft_status(apps, schema_editor):
    # Legacy tables are restored separately, including in fresh installations.
    connection = schema_editor.connection
    if "tblinvitation" not in connection.introspection.table_names():
        return
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1 FROM tblinvitationstatus WHERE status = 0")
        if cursor.fetchone() is None:
            raise RuntimeError("Missing invitation draft status 0; restore the status lookup first.")
        cursor.execute("UPDATE tblinvitation SET status = 0 WHERE status IS NULL")
        cursor.execute("ALTER TABLE tblinvitation ALTER COLUMN status SET DEFAULT 0")
        cursor.execute("ALTER TABLE tblinvitation ALTER COLUMN status SET NOT NULL")


def allow_null_status(apps, schema_editor):
    # Do not turn repaired drafts back into ambiguous NULL records on rollback.
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("ALTER TABLE IF EXISTS tblinvitation ALTER COLUMN status DROP NOT NULL")


class Migration(migrations.Migration):
    dependencies = [("api", "0003_audit_summary")]
    operations = [migrations.RunPython(normalize_draft_status, allow_null_status)]
