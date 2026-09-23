from django.db import migrations, models


ADD_TENDER_ACTIVITY_SQL = """
ALTER TABLE IF EXISTS tbltender
    ADD COLUMN IF NOT EXISTS activityid integer NULL;

DO $$
BEGIN
    IF to_regclass('tbltender') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS tbltender_activityid_idx
            ON tbltender (activityid);

        IF to_regclass('tblvendoractivity') IS NOT NULL THEN
            -- The legacy table was imported without its model-declared primary key.
            -- A non-partial unique index is sufficient as the referenced key and
            -- preserves the intended stable activity IDs without rewriting rows.
            CREATE UNIQUE INDEX IF NOT EXISTS tblvendoractivity_activityid_uidx
                ON tblvendoractivity (activityid);

            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'tbltender_activityid_fk'
                  AND conrelid = 'tbltender'::regclass
            ) THEN
                ALTER TABLE tbltender
                    ADD CONSTRAINT tbltender_activityid_fk
                    FOREIGN KEY (activityid)
                    REFERENCES tblvendoractivity (activityid)
                    ON DELETE RESTRICT;
            END IF;
        END IF;
    END IF;
END
$$;
"""


DROP_TENDER_ACTIVITY_SQL = """
ALTER TABLE IF EXISTS tbltender
    DROP CONSTRAINT IF EXISTS tbltender_activityid_fk;
DROP INDEX IF EXISTS tbltender_activityid_idx;
DROP INDEX IF EXISTS tblvendoractivity_activityid_uidx;
ALTER TABLE IF EXISTS tbltender
    DROP COLUMN IF EXISTS activityid;
"""


class Migration(migrations.Migration):
    dependencies = [('api', '0009_evaluate_permission')]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=ADD_TENDER_ACTIVITY_SQL,
                    reverse_sql=DROP_TENDER_ACTIVITY_SQL,
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name='tbltender',
                    name='activityid',
                    field=models.IntegerField(blank=True, null=True),
                ),
            ],
        ),
    ]
