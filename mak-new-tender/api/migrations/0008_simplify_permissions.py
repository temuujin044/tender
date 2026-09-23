from django.db import migrations


PERMISSIONS = (
    ('TenderEdit', 'Тендер үүсгэх, засах'),
    ('Committee', 'Үнэлгээний хороо бүрдүүлэх'),
    ('Publish', 'Хянаж нийтлэх'),
    ('Cancel', 'Тендер цуцлах'),
)


def configure_permissions(apps, schema_editor):
    connection = schema_editor.connection
    tables = set(connection.introspection.table_names())
    if 'tblaction' not in tables:
        return

    with connection.cursor() as cursor:
        for code, name in PERMISSIONS:
            cursor.execute(
                "SELECT id FROM tblaction WHERE actioncode=%s ORDER BY id LIMIT 1",
                [code],
            )
            row = cursor.fetchone()
            if row:
                cursor.execute(
                    "UPDATE tblaction SET actionname=%s WHERE id=%s",
                    [name, row[0]],
                )
            else:
                cursor.execute(
                    "INSERT INTO tblaction(actioncode, actionname) VALUES (%s, %s)",
                    [code, name],
                )


class Migration(migrations.Migration):
    dependencies = [('api', '0007_publish_permission')]
    # Legacy action rows and their assignments are retained for audit/history,
    # but the application exposes only the four permissions above.
    operations = [migrations.RunPython(configure_permissions, migrations.RunPython.noop)]
