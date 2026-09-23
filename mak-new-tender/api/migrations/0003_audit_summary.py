from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("api", "0002_business_audit")]
    operations = [
        migrations.CreateModel(
            name="AuditSummary",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("event", models.OneToOneField(to="api.auditevent", on_delete=django.db.models.deletion.PROTECT, related_name="summary")),
                ("title", models.CharField(max_length=250)),
                ("entity_name", models.TextField(default="")),
                ("entity_code", models.CharField(max_length=100, default="")),
                ("details", models.JSONField(default=list)),
                ("visible", models.BooleanField(default=True, db_index=True)),
            ], options={"db_table": "audit_summary"},
        ),
        # Legacy tables are restored separately. NULL means older rows did not
        # record this option; do not invent a historical true/false value.
        migrations.RunSQL(
            "ALTER TABLE IF EXISTS tblrequire ADD COLUMN IF NOT EXISTS document_required boolean NULL",
            "ALTER TABLE IF EXISTS tblrequire DROP COLUMN IF EXISTS document_required",
        ),
        migrations.RunSQL(
            "CREATE TRIGGER protect_business_audit BEFORE UPDATE OR DELETE ON audit_summary FOR EACH ROW EXECUTE FUNCTION protect_business_audit()",
            "DROP TRIGGER IF EXISTS protect_business_audit ON audit_summary",
        ),
    ]
