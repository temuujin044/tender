from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("api", "0012_backfill_numeric_vendor_activity")]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        ALTER TABLE IF EXISTS tbltenderbatch
                        ADD COLUMN IF NOT EXISTS budget numeric(19, 4) NULL
                    """,
                    reverse_sql="""
                        ALTER TABLE IF EXISTS tbltenderbatch
                        DROP COLUMN IF EXISTS budget
                    """,
                )
            ],
            state_operations=[
                migrations.AddField(
                    model_name="tbltenderbatch",
                    name="budget",
                    field=models.DecimalField(
                        blank=True,
                        decimal_places=4,
                        max_digits=19,
                        null=True,
                    ),
                )
            ],
        )
    ]
