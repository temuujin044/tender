from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


# Frozen allowlist: authentication, employee sync, and legacy log tables are excluded.
TABLES = """
tblcode tblcomment tblcriteria tblcriteriatype tbldepartment tblemailcc
tblevaluation tblfiles tblfoldercase tblinvevaluate tblinvitation
tblinvitationofvendor tblinvitationvendor_selection tbljoinwork
tbljoinworkofvendor tbljoinworktask tblljoinworkdoc tblmastercontract
tblmastercontractdetail tblmembertype tblnotes tblorderlineallocate
tblpurchaseorder tblpurchaseorderline tblpurchasetype tblqoute tblrequire
tblrequiretype tblsettings tbltender tbltenderbatch tbltenderdelay tbltenderdoc
tbltenderdoctype tbltenderjoindoc tbltenderopen tbltendertype tblvendor
tblvendoractivity tblvendorcategoryrel tblvendordoc tblvendorsubactivity
tblconsumeorderline tbltransitorder tbltransitorderline
""".split()


def install_triggers(apps, schema_editor):
    # Legacy tables are restored separately, not created by Django migrations.
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT current_schema()")
        schema = cursor.fetchone()[0]
        q = schema_editor.quote_name
        cursor.execute(f"""
            CREATE OR REPLACE FUNCTION {q(schema)}.audit_safe_row(value jsonb)
            RETURNS jsonb LANGUAGE sql IMMUTABLE AS $audit$
                SELECT CASE WHEN value IS NULL THEN NULL ELSE
                    COALESCE(jsonb_object_agg(key, CASE
                        WHEN lower(key) ~ '(password|passwd|pwd|salt|hash|token|secret|cookie|session|authorization|bankaccount|^ip$|ipaddress|ip_address|remote_addr|useragent|user_agent|filecontent|filedata|binary|image)'
                        THEN '"[REDACTED]"'::jsonb ELSE val END), '{{}}'::jsonb)
                    END
                FROM jsonb_each(value) AS fields(key, val)
            $audit$;

            CREATE OR REPLACE FUNCTION {q(schema)}.capture_business_audit()
            RETURNS trigger LANGUAGE plpgsql AS $audit$
            DECLARE
                event_id bigint;
                old_row jsonb;
                new_row jsonb;
                identity jsonb;
                row_value jsonb;
            BEGIN
                event_id := NULLIF(current_setting('tender.audit_event_id', true), '')::bigint;
                IF event_id IS NULL THEN RETURN NULL; END IF;
                IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN NULL; END IF;
                IF TG_OP <> 'INSERT' THEN old_row := {q(schema)}.audit_safe_row(to_jsonb(OLD)); END IF;
                IF TG_OP <> 'DELETE' THEN new_row := {q(schema)}.audit_safe_row(to_jsonb(NEW)); END IF;
                row_value := COALESCE(new_row, old_row);
                SELECT COALESCE(jsonb_object_agg(key, value), '{{}}'::jsonb) INTO identity
                    FROM jsonb_each(row_value) WHERE key ~ '(^id$|id$|_id$)';
                INSERT INTO {q(schema)}.audit_change
                    (event_id, table_name, operation, record_key, before, after)
                VALUES (event_id, TG_TABLE_NAME, lower(TG_OP), identity, old_row, new_row);
                RETURN NULL;
            END;
            $audit$;

            CREATE OR REPLACE FUNCTION {q(schema)}.protect_business_audit()
            RETURNS trigger LANGUAGE plpgsql AS $audit$
            BEGIN
                IF TG_TABLE_NAME = 'audit_event' AND TG_OP = 'UPDATE' THEN
                    IF OLD.outcome = 'pending' AND NEW.outcome IN ('success', 'failed')
                       AND (to_jsonb(OLD) - 'outcome' - 'status_code') =
                           (to_jsonb(NEW) - 'outcome' - 'status_code') THEN
                        RETURN NEW;
                    END IF;
                END IF;
                RAISE EXCEPTION 'Business audit records cannot be edited or deleted';
            END;
            $audit$;
        """)
        for audit_table in ("audit_event", "audit_change"):
            cursor.execute(f"DROP TRIGGER IF EXISTS protect_business_audit ON {q(schema)}.{q(audit_table)}")
            cursor.execute(f"""
                CREATE TRIGGER protect_business_audit BEFORE UPDATE OR DELETE
                ON {q(schema)}.{q(audit_table)} FOR EACH ROW
                EXECUTE FUNCTION {q(schema)}.protect_business_audit()
            """)
        for table in TABLES:
            cursor.execute("SELECT to_regclass(%s)", [f'{q(schema)}.{q(table)}'])
            if cursor.fetchone()[0] is None:
                continue
            cursor.execute(f"DROP TRIGGER IF EXISTS business_audit ON {q(schema)}.{q(table)}")
            cursor.execute(f"""
                CREATE TRIGGER business_audit AFTER INSERT OR UPDATE OR DELETE
                ON {q(schema)}.{q(table)} FOR EACH ROW
                EXECUTE FUNCTION {q(schema)}.capture_business_audit()
            """)


def remove_triggers(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT current_schema()")
        schema = schema_editor.quote_name(cursor.fetchone()[0])
        cursor.execute(f"DROP FUNCTION IF EXISTS {schema}.capture_business_audit() CASCADE")
        cursor.execute(f"DROP FUNCTION IF EXISTS {schema}.audit_safe_row(jsonb)")
        cursor.execute(f"DROP FUNCTION IF EXISTS {schema}.protect_business_audit() CASCADE")


class Migration(migrations.Migration):
    dependencies = [("api", "0001_postgresql_compatibility")]
    operations = [
        migrations.CreateModel(
            name="AuditEvent",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name="ID")),
                ("request_id", models.UUIDField(unique=True)),
                ("occurred_at", models.DateTimeField(default=django.utils.timezone.now, db_index=True)),
                ("user_id", models.BigIntegerField(db_index=True)),
                ("username", models.CharField(max_length=200)),
                ("role", models.CharField(max_length=20, db_index=True)),
                ("employee_id", models.BigIntegerField(null=True)),
                ("vendor_id", models.BigIntegerField(null=True, db_index=True)),
                ("action", models.CharField(max_length=160, db_index=True)),
                ("resource", models.CharField(max_length=250)),
                ("outcome", models.CharField(max_length=20, db_index=True)),
                ("status_code", models.PositiveSmallIntegerField()),
            ],
            options={"db_table": "audit_event", "ordering": ["-occurred_at", "-id"]},
        ),
        migrations.CreateModel(
            name="AuditChange",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name="ID")),
                ("table_name", models.CharField(max_length=100, db_index=True)),
                ("operation", models.CharField(max_length=10)),
                ("record_key", models.JSONField(default=dict)),
                ("before", models.JSONField(null=True)),
                ("after", models.JSONField(null=True)),
                ("event", models.ForeignKey(to="api.auditevent", on_delete=django.db.models.deletion.PROTECT, related_name="changes")),
            ],
            options={"db_table": "audit_change"},
        ),
        migrations.RunPython(install_triggers, remove_triggers),
    ]
