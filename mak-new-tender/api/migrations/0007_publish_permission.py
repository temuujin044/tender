from django.db import migrations


def add_permission(apps, schema_editor):
    connection = schema_editor.connection
    if 'tblaction' not in connection.introspection.table_names():
        return
    with connection.cursor() as cursor:
        cursor.execute("INSERT INTO tblaction(actioncode,actionname) SELECT 'Publish','Нийтлэх зөвшөөрөл' "
                       "WHERE NOT EXISTS (SELECT 1 FROM tblaction WHERE actioncode='Publish')")


class Migration(migrations.Migration):
    dependencies = [('api', '0006_republish_origin')]
    # Keep assignments intact on code rollback; this is a harmless permission lookup.
    operations = [migrations.RunPython(add_permission, migrations.RunPython.noop)]
