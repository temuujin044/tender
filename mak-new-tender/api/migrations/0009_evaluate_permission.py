from django.db import migrations


def add_evaluate_permission(apps, schema_editor):
    connection = schema_editor.connection
    if 'tblaction' not in set(connection.introspection.table_names()):
        return

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id FROM tblaction WHERE actioncode=%s ORDER BY id LIMIT 1",
            ['Evaluate'],
        )
        row = cursor.fetchone()
        if row:
            cursor.execute(
                "UPDATE tblaction SET actionname=%s WHERE id=%s",
                ['Үнэлгээ өгөх', row[0]],
            )
        else:
            cursor.execute(
                "INSERT INTO tblaction(actioncode, actionname) VALUES (%s, %s)",
                ['Evaluate', 'Үнэлгээ өгөх'],
            )


class Migration(migrations.Migration):
    dependencies = [('api', '0008_simplify_permissions')]
    operations = [migrations.RunPython(add_evaluate_permission, migrations.RunPython.noop)]
