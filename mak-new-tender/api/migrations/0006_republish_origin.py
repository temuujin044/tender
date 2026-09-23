from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [('api', '0005_merge_0002_initial_0004_invitation_draft_status')]
    operations = [migrations.RunSQL(
        'ALTER TABLE IF EXISTS tblinvitation ADD COLUMN IF NOT EXISTS republish_origin_status integer NULL',
        'ALTER TABLE IF EXISTS tblinvitation DROP COLUMN IF EXISTS republish_origin_status',
    ), migrations.RunSQL(
        'ALTER TABLE IF EXISTS tblinvitation ADD COLUMN IF NOT EXISTS reissued_from_invitationid integer NULL',
        'ALTER TABLE IF EXISTS tblinvitation DROP COLUMN IF EXISTS reissued_from_invitationid',
    )]
