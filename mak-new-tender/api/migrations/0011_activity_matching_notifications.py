from django.db import migrations, models
import django.utils.timezone


def backfill_activity_relations(apps, schema_editor):
    connection = schema_editor.connection
    tables = set(connection.introspection.table_names())
    required = {'tblvendoractivity', 'tblvendor', 'tbltender'}
    if not required.issubset(tables):
        return

    with connection.cursor() as cursor:
        cursor.execute(
            '''
            INSERT INTO vendor_activity_relation (vendorid, activityid)
            SELECT DISTINCT v.vendorid, a.activityid
            FROM tblvendor v
            INNER JOIN tblvendoractivity a
                ON LOWER(BTRIM(a.activity))=LOWER(BTRIM(v.activity))
            WHERE v.vendorid IS NOT NULL
              AND BTRIM(COALESCE(v.activity, ''))<>''
            ON CONFLICT (vendorid, activityid) DO NOTHING
            '''
        )
        cursor.execute(
            '''
            INSERT INTO tender_activity_relation (tenderid, activityid)
            SELECT DISTINCT t.tenderid, t.activityid
            FROM tbltender t
            INNER JOIN tblvendoractivity a ON a.activityid=t.activityid
            WHERE t.activityid IS NOT NULL
            ON CONFLICT (tenderid, activityid) DO NOTHING
            '''
        )


class Migration(migrations.Migration):
    dependencies = [('api', '0010_tender_activity')]

    operations = [
        migrations.CreateModel(
            name='VendorActivityRelation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('vendorid', models.BigIntegerField(db_index=True)),
                ('activityid', models.IntegerField(db_index=True)),
            ],
            options={
                'db_table': 'vendor_activity_relation',
                'constraints': [
                    models.UniqueConstraint(
                        fields=('vendorid', 'activityid'),
                        name='unique_vendor_activity_relation',
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name='TenderActivityRelation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tenderid', models.BigIntegerField(db_index=True)),
                ('activityid', models.IntegerField(db_index=True)),
            ],
            options={
                'db_table': 'tender_activity_relation',
                'constraints': [
                    models.UniqueConstraint(
                        fields=('tenderid', 'activityid'),
                        name='unique_tender_activity_relation',
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name='TenderInvitationRecipient',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('invitationid', models.BigIntegerField(db_index=True)),
                ('tenderid', models.BigIntegerField(db_index=True)),
                ('vendorid', models.BigIntegerField(db_index=True)),
                ('vendorname', models.CharField(blank=True, default='', max_length=200)),
                ('email', models.EmailField(max_length=254)),
                ('matched_activity_ids', models.JSONField(default=list)),
                ('delivery_status', models.CharField(db_index=True, default='queued', max_length=20)),
                ('attempt_count', models.PositiveSmallIntegerField(default=0)),
                ('queued_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('last_error', models.TextField(blank=True, default='')),
            ],
            options={
                'db_table': 'tender_invitation_recipient',
                'constraints': [
                    models.UniqueConstraint(
                        fields=('invitationid', 'vendorid'),
                        name='unique_tender_invitation_recipient',
                    )
                ],
            },
        ),
        migrations.RunPython(backfill_activity_relations, migrations.RunPython.noop),
    ]
