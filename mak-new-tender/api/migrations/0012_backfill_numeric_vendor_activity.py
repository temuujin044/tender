from django.db import migrations


def backfill_numeric_vendor_activity(apps, schema_editor):
    tables = set(schema_editor.connection.introspection.table_names())
    if not {'tblvendor', 'tblvendoractivity', 'vendor_activity_relation'}.issubset(tables):
        return

    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            '''
            INSERT INTO vendor_activity_relation(vendorid, activityid)
            SELECT DISTINCT vendor.vendorid, activity.activityid
            FROM tblvendor vendor
            INNER JOIN tblvendoractivity activity
                ON activity.activityid=CASE
                    WHEN BTRIM(COALESCE(vendor.activity, '')) ~ '^[0-9]+$'
                    THEN BTRIM(vendor.activity)::integer
                END
            WHERE BTRIM(COALESCE(vendor.activity, '')) ~ '^[0-9]+$'
            ON CONFLICT (vendorid, activityid) DO NOTHING
            '''
        )


class Migration(migrations.Migration):
    dependencies = [('api', '0011_activity_matching_notifications')]

    operations = [
        migrations.RunPython(backfill_numeric_vendor_activity, migrations.RunPython.noop),
    ]
