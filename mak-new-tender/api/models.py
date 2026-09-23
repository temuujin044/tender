# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models
from django.utils import timezone


class AuditEvent(models.Model):
    """Server-attributed business action; no authentication or network data."""

    request_id = models.UUIDField(unique=True)
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)
    user_id = models.BigIntegerField(db_index=True)
    username = models.CharField(max_length=200)
    role = models.CharField(max_length=20, db_index=True)
    employee_id = models.BigIntegerField(null=True)
    vendor_id = models.BigIntegerField(null=True, db_index=True)
    action = models.CharField(max_length=160, db_index=True)
    # A route template, never the URL query string or request body.
    resource = models.CharField(max_length=250)
    outcome = models.CharField(max_length=20, db_index=True)
    status_code = models.PositiveSmallIntegerField()

    class Meta:
        db_table = "audit_event"
        ordering = ["-occurred_at", "-id"]


class AuditChange(models.Model):
    event = models.ForeignKey(AuditEvent, on_delete=models.PROTECT, related_name="changes")
    table_name = models.CharField(max_length=100, db_index=True)
    operation = models.CharField(max_length=10)
    record_key = models.JSONField(default=dict)
    before = models.JSONField(null=True)
    after = models.JSONField(null=True)

    class Meta:
        db_table = "audit_change"


class AuditSummary(models.Model):
    event = models.OneToOneField(AuditEvent, on_delete=models.PROTECT, related_name="summary")
    title = models.CharField(max_length=250)
    entity_name = models.TextField(default="")
    entity_code = models.CharField(max_length=100, default="")
    details = models.JSONField(default=list)
    visible = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "audit_summary"


class Tblaction(models.Model):
    actioncode = models.CharField(max_length=10, blank=True, null=True)
    actionname = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblaction'


class Tbladmin(models.Model):
    empid = models.IntegerField(blank=True, null=True)
    email = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tbladmin'


class Tblcode(models.Model):
    codetypeid = models.IntegerField(blank=True, null=True)
    codename = models.CharField(max_length=100, blank=True, null=True)
    tendertypeid = models.IntegerField(blank=True, null=True)
    newnumber = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblcode'


class Tblcomment(models.Model):
    commentid = models.AutoField(primary_key=True)
    commenttitle = models.CharField(max_length=200, blank=True, null=True)
    commentdate = models.DateTimeField(blank=True, null=True)
    comment = models.CharField(max_length=2000, blank=True, null=True)
    vendorid = models.IntegerField(blank=True, null=True)
    seen = models.IntegerField(blank=True, null=True)
    invitationid = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblcomment'


class Tblconsumeorderline(models.Model):
    expenseid = models.IntegerField(blank=True, null=True)
    consumeid = models.IntegerField(blank=True, null=True)
    lineid = models.IntegerField(blank=True, null=True)
    warehouseid = models.IntegerField(blank=True, null=True)
    locationid = models.IntegerField(blank=True, null=True)
    productid = models.IntegerField(blank=True, null=True)
    quantity = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    actualqty = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    productbarcode = models.CharField(max_length=200, blank=True, null=True)
    productname = models.CharField(max_length=200, blank=True, null=True)
    status = models.IntegerField(blank=True, null=True)
    issueqty = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    consumename = models.CharField(max_length=500, blank=True, null=True)
    date_field = models.DateTimeField(db_column='date_', blank=True, null=True)  # Field renamed because it ended with '_'.

    class Meta:
        managed = False
        db_table = 'tblconsumeorderline'


class Tblcriteria(models.Model):
    criteriaid = models.AutoField(primary_key=True)
    criteriatypeid = models.IntegerField(blank=True, null=True)
    criterianame = models.CharField(max_length=500, blank=True, null=True)
    weight = models.CharField(max_length=50, blank=True, null=True)
    visible = models.IntegerField(blank=True, null=True)
    invitationid = models.IntegerField(db_column='invitationid', blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'tblcriteria'


class Tblcriteriatype(models.Model):
    criteriatypeid = models.AutoField(primary_key=True)
    criteriatypename = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblcriteriatype'


class Tbldepartment(models.Model):
    departmentid = models.AutoField(primary_key=True)
    departmentname = models.CharField(max_length=100, blank=True, null=True)
    depcode = models.CharField(db_column='depcode', max_length=100, blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'tbldepartment'


class Tblemailcc(models.Model):
    empname = models.CharField(max_length=200, blank=True, null=True)
    positionname = models.CharField(max_length=200, blank=True, null=True)
    email = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblemailcc'


class Tblemp(models.Model):
    empid = models.IntegerField(blank=True, null=True)
    empname = models.CharField(max_length=500, blank=True, null=True)
    positionname = models.CharField(max_length=500, blank=True, null=True)
    email = models.CharField(max_length=500, blank=True, null=True)
    image = models.CharField(max_length=500, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblemp'


class Tblevaluation(models.Model):
    evaluationid = models.AutoField(primary_key=True)
    invitationid = models.IntegerField(blank=True, null=True)
    empid = models.IntegerField(blank=True, null=True)
    empname = models.CharField(max_length=100, blank=True, null=True)
    positionname = models.CharField(max_length=100, blank=True, null=True)
    roleid = models.IntegerField(blank=True, null=True)
    createdby = models.CharField(max_length=100, blank=True, null=True)
    created = models.DateTimeField(blank=True, null=True)
    email = models.CharField(max_length=200, blank=True, null=True)
    image = models.CharField(max_length=500, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblevaluation'


class Tblfiles(models.Model):
    fileid = models.AutoField(primary_key=True)
    filename = models.CharField(max_length=200, blank=True, null=True)
    fileext = models.CharField(max_length=100, blank=True, null=True)
    filedata = models.TextField(blank=True, null=True)
    filepath = models.CharField(max_length=1000, blank=True, null=True)
    created = models.CharField(max_length=100, blank=True, null=True)
    createdby = models.CharField(max_length=100, blank=True, null=True)
    filetype = models.CharField(max_length=20, blank=True, null=True)
    sourceid = models.IntegerField(blank=True, null=True)
    sourcetype = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblfiles'


class Tblfoldercase(models.Model):
    documentname = models.CharField(max_length=100, blank=True, null=True)
    fileid = models.IntegerField(blank=True, null=True)
    invitationid = models.IntegerField(blank=True, null=True)
    created = models.CharField(max_length=100, blank=True, null=True)
    createdby = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblfoldercase'


class Tblinvevaluate(models.Model):
    empid = models.IntegerField(blank=True, null=True)
    invitationid = models.IntegerField(blank=True, null=True)
    vendorid = models.IntegerField(blank=True, null=True)
    criteriaid = models.IntegerField(blank=True, null=True)
    result = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    createdby = models.CharField(max_length=100, blank=True, null=True)
    created = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblinvevaluate'


class Tblinvitation(models.Model):
    invitationid = models.AutoField(primary_key=True)
    tender = models.ForeignKey(
        'Tbltender',
        db_column='tenderid',
        on_delete=models.DO_NOTHING,
        related_name='invitations'
    )
    createdby = models.CharField(max_length=100, blank=True, null=True)
    created = models.DateTimeField(blank=True, null=True)
    acceptdate = models.DateTimeField(blank=True, null=True)
    opendate = models.DateTimeField(blank=True, null=True)
    description = models.CharField(db_column='description', max_length=10000, blank=True, null=True)
    invitationcode = models.CharField(max_length=20, blank=True, null=True)
    status = models.ForeignKey(
        'Tblinvitationstatus',
        db_column="status",
        default=0,
        on_delete=models.DO_NOTHING
    )
    openby = models.CharField(max_length=200, blank=True, null=True)
    note = models.CharField(max_length=2000, blank=True, null=True)
    delayedby = models.CharField(max_length=200, blank=True, null=True)
    delaynote = models.CharField(max_length=2000, blank=True, null=True)
    rejectby = models.CharField(max_length=200, blank=True, null=True)
    rejectnote = models.CharField(max_length=500, blank=True, null=True)
    
    class Meta:
        managed = False
        db_table = 'tblinvitation'


class Tblinvitationofvendor(models.Model):
    tenderid = models.IntegerField(blank=True, null=True)
    invitation = models.ForeignKey(
        'Tblinvitation',
        db_column='invitationid',
        on_delete=models.DO_NOTHING,
        related_name='invitation_vendors'
    )

    vendor = models.ForeignKey(
        'Tblvendor',
        db_column='vendorid',
        on_delete=models.DO_NOTHING,
        related_name='vendor_invitations'
    )
    status = models.IntegerField(blank=True, null=True)
    created = models.CharField(max_length=100, blank=True, null=True)
    createdby = models.CharField(max_length=100, blank=True, null=True)
    salespoint = models.IntegerField(blank=True, null=True)
    assetpoint = models.IntegerField(blank=True, null=True)
    resourcepoint = models.IntegerField(blank=True, null=True)
    note = models.CharField(max_length=2000, blank=True, null=True)
    approvedamount = models.DecimalField(max_digits=10, decimal_places=4, blank=True, null=True)
    updated = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblinvitationofvendor'


class Tblinvitationstatus(models.Model):
    status = models.IntegerField(blank=True, null=True)
    name = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblinvitationstatus'


class Tbljoinwork(models.Model):
    joinworkid = models.AutoField(primary_key=True)
    joinworkcode = models.CharField(max_length=20, blank=True, null=True)
    joinworkname = models.CharField(max_length=200, blank=True, null=True)
    departmentid = models.IntegerField(blank=True, null=True)
    tendertypeid = models.IntegerField(blank=True, null=True)
    startdate = models.DateTimeField(blank=True, null=True)
    enddate = models.DateTimeField(blank=True, null=True)
    note = models.CharField(max_length=2000, blank=True, null=True)
    created = models.CharField(max_length=100, blank=True, null=True)
    createdby = models.CharField(max_length=30, blank=True, null=True)
    status = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tbljoinwork'


class Tbljoinworkofvendor(models.Model):
    vendorid = models.IntegerField(blank=True, null=True)
    joinworkid = models.IntegerField(blank=True, null=True)
    status = models.IntegerField(blank=True, null=True)
    created = models.CharField(max_length=100, blank=True, null=True)
    createdby = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tbljoinworkofvendor'


class Tblljoinworkdoc(models.Model):
    joindocid = models.AutoField(primary_key=True)
    documentname = models.CharField(max_length=100, blank=True, null=True)
    fileid = models.IntegerField(blank=True, null=True)
    joinworkid = models.IntegerField(blank=True, null=True)
    vendorid = models.IntegerField(blank=True, null=True)
    created = models.CharField(max_length=100, blank=True, null=True)
    createdby = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblljoinworkdoc'


class Tblmembertype(models.Model):
    membertypeid = models.AutoField(primary_key=True)
    membertypename = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblmembertype'


class Tblnotes(models.Model):
    noteid = models.AutoField(primary_key=True)
    invitationid = models.IntegerField(blank=True, null=True)
    address = models.CharField(max_length=500, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.CharField(max_length=30, blank=True, null=True)
    website = models.CharField(max_length=20, blank=True, null=True)
    electron = models.IntegerField(blank=True, null=True)
    post = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblnotes'


class Tblorderlineallocate(models.Model):
    tmpid = models.IntegerField(blank=True, null=True)
    orderid = models.IntegerField(blank=True, null=True)
    lineid = models.IntegerField(blank=True, null=True)
    fromwarehouseid = models.IntegerField(blank=True, null=True)
    towarehouseid = models.IntegerField(blank=True, null=True)
    towarehousename = models.CharField(max_length=500, blank=True, null=True)
    productid = models.IntegerField(blank=True, null=True)
    quantity = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblorderlineallocate'


class Tblpurchaseorder(models.Model):
    orderid = models.IntegerField(blank=True, null=True)
    ordernumber = models.CharField(max_length=200, blank=True, null=True)
    warehouseid = models.IntegerField(blank=True, null=True)
    warehousename = models.CharField(max_length=200, blank=True, null=True)
    totalquantity = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    sectorid = models.IntegerField(blank=True, null=True)
    sectorname = models.CharField(max_length=500, blank=True, null=True)
    buyerid = models.IntegerField(blank=True, null=True)
    buyername = models.CharField(max_length=200, blank=True, null=True)
    orderdate = models.DateTimeField(blank=True, null=True)
    vendorid = models.IntegerField(blank=True, null=True)
    vendorname = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblpurchaseorder'


class Tblpurchaseorderline(models.Model):
    lineid = models.IntegerField(blank=True, null=True)
    orderid = models.IntegerField(blank=True, null=True)
    ordername = models.CharField(max_length=200, blank=True, null=True)
    productid = models.IntegerField(blank=True, null=True)
    productuom = models.CharField(max_length=200, blank=True, null=True)
    productquantity = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    productbarcode = models.CharField(max_length=200, blank=True, null=True)
    productname = models.CharField(max_length=200, blank=True, null=True)
    priceunit = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    status = models.IntegerField(blank=True, null=True)
    actualqty = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    locationid = models.IntegerField(blank=True, null=True)
    locationname = models.CharField(max_length=200, blank=True, null=True)
    locationbarcode = models.CharField(max_length=200, blank=True, null=True)
    receiptqty = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    warehouseid = models.IntegerField(blank=True, null=True)
    istemp = models.IntegerField(blank=True, null=True)
    ordernumber = models.CharField(max_length=500, blank=True, null=True)
    date_field = models.DateTimeField(db_column='date_', blank=True, null=True)  # Field renamed because it ended with '_'.

    class Meta:
        managed = False
        db_table = 'tblpurchaseorderline'


class Tblpurchasetype(models.Model):
    purchasetypeid = models.AutoField(primary_key=True)
    purchasetypename = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblpurchasetype'


class Tblqoute(models.Model):
    qouteid = models.AutoField(primary_key=True)
    qoutedate = models.DateTimeField(blank=True, null=True)
    qouteamount = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    deliveryday = models.IntegerField(blank=True, null=True)
    invitationid = models.IntegerField(blank=True, null=True)
    tenderid = models.IntegerField(blank=True, null=True)
    created = models.CharField(max_length=100, blank=True, null=True)
    createdby = models.CharField(max_length=100, blank=True, null=True)
    vendorid = models.IntegerField(blank=True, null=True)
    deliverydate = models.DateTimeField(blank=True, null=True)
    batchid = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblqoute'


class Tblrequire(models.Model):
    requireid = models.AutoField(primary_key=True)
    invitationid = models.IntegerField(blank=True, null=True)
    requirename = models.CharField(max_length=500, blank=True, null=True)
    document_required = models.BooleanField(null=True)
    visible = models.IntegerField(blank=True, null=True)
    requiretypeid = models.IntegerField(blank=True, null=True)
    criteriaid = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblrequire'


class Tblrequiretype(models.Model):
    requirevalue = models.CharField(max_length=2000, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblrequiretype'


class Tblrole(models.Model):
    roleid = models.AutoField(primary_key=True)
    rolename = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblrole'


class Tblsettings(models.Model):
    actionid = models.IntegerField(blank=True, null=True)
    membertypeid = models.IntegerField(blank=True, null=True)
    empid = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblsettings'


class Tbltender(models.Model):
    tenderid = models.AutoField(primary_key=True)
    tendercode = models.CharField(max_length=100, blank=True, null=True)
    tendername = models.CharField(max_length=2000, blank=True, null=True)
    tendertype = models.ForeignKey(
        'Tbltendertype',
        db_column='tendertypeid',
        on_delete=models.DO_NOTHING,
        related_name='tenders'
    )
    purchasetypeid = models.IntegerField(blank=True, null=True)
    departmentid = models.IntegerField(blank=True, null=True)
    activityid = models.IntegerField(blank=True, null=True)
    budget = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    evaluationdate = models.DateTimeField(blank=True, null=True)
    publishdate = models.DateTimeField(blank=True, null=True)
    startdate = models.DateTimeField(blank=True, null=True)
    enddate = models.DateTimeField(blank=True, null=True)
    createdby = models.CharField(max_length=100, blank=True, null=True)
    created = models.DateTimeField(blank=True, null=True)
    plandate = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tbltender'


class Tbltenderbatch(models.Model):
    batchid = models.AutoField(primary_key=True)
    tenderid = models.IntegerField()
    batchcode = models.CharField(max_length=100, blank=True, null=True)
    batchname = models.CharField(max_length=100, blank=True, null=True)
    budget = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tbltenderbatch'


class Tbltenderdelay(models.Model):
    delayedby = models.CharField(max_length=200, blank=True, null=True)
    delayednote = models.CharField(max_length=200, blank=True, null=True)
    acceptdate = models.DateTimeField(blank=True, null=True)
    opendate = models.DateTimeField(blank=True, null=True)
    invitationid = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tbltenderdelay'


class Tbltenderdoc(models.Model):
    docid = models.AutoField(primary_key=True)
    documentcode = models.CharField(max_length=100, blank=True, null=True)
    documentname = models.CharField(max_length=100, blank=True, null=True)
    doctypeid = models.IntegerField(blank=True, null=True)
    fileid = models.IntegerField(blank=True, null=True)
    batchid = models.IntegerField(blank=True, null=True)
    tenderid = models.IntegerField(blank=True, null=True)
    invitationid = models.IntegerField(blank=True, null=True)
    created = models.CharField(max_length=100, blank=True, null=True)
    createdby = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tbltenderdoc'


class Tbltenderdoctype(models.Model):
    doctypeid = models.AutoField(primary_key=True)
    doctypename = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tbltenderdoctype'


class Tbltenderjoindoc(models.Model):
    joindocid = models.AutoField(primary_key=True)
    documentname = models.CharField(max_length=100, blank=True, null=True)
    fileid = models.IntegerField(blank=True, null=True)
    tenderid = models.IntegerField(blank=True, null=True)
    invitationid = models.IntegerField(blank=True, null=True)
    created = models.CharField(max_length=100, blank=True, null=True)
    createdby = models.CharField(max_length=100, blank=True, null=True)
    vendorid = models.IntegerField(blank=True, null=True)
    requiretypeid = models.IntegerField(blank=True, null=True)
    batchid = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tbltenderjoindoc'


class Tbltenderopen(models.Model):
    empid = models.IntegerField(blank=True, null=True)
    email = models.CharField(max_length=200, blank=True, null=True)
    invitationid = models.IntegerField(blank=True, null=True)
    membertypeid = models.IntegerField(blank=True, null=True)
    created = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tbltenderopen'


class Tbltendertype(models.Model):
    tendertypeid = models.AutoField(primary_key=True)
    tendertypename = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tbltendertype'


class Tbltenderuser(models.Model):
    userid = models.AutoField(primary_key=True)
    username = models.CharField(max_length=100, blank=True, null=True)
    password = models.CharField(max_length=100, blank=True, null=True)
    empid = models.IntegerField(blank=True, null=True)
    empname = models.CharField(max_length=100, blank=True, null=True)
    positionname = models.CharField(max_length=100, blank=True, null=True)
    vendorid = models.IntegerField(blank=True, null=True)
    passwordsalt = models.CharField(db_column='passwordsalt', max_length=50, blank=True, null=True)  # Field name made lowercase.
    passwordhash = models.CharField(db_column='passwordhash', max_length=50, blank=True, null=True)  # Field name made lowercase.

    class Meta:
        managed = False
        db_table = 'tbltenderuser'


class Tbltransitorder(models.Model):
    transitid = models.IntegerField(blank=True, null=True)
    transferdate = models.DateTimeField(blank=True, null=True)
    fromwarehouseid = models.IntegerField(blank=True, null=True)
    fromwarehousename = models.CharField(max_length=500, blank=True, null=True)
    towarehouseid = models.IntegerField(blank=True, null=True)
    towarehousename = models.CharField(max_length=500, blank=True, null=True)
    status = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tbltransitorder'


class Tbltransitorderline(models.Model):
    lineid = models.IntegerField(blank=True, null=True)
    transitid = models.IntegerField(blank=True, null=True)
    purchaseorderid = models.IntegerField(blank=True, null=True)
    productid = models.IntegerField(blank=True, null=True)
    quantity = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    productbarcode = models.CharField(max_length=200, blank=True, null=True)
    productname = models.CharField(max_length=200, blank=True, null=True)
    status = models.IntegerField(blank=True, null=True)
    actualqty = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    transqty = models.DecimalField(max_digits=19, decimal_places=4, blank=True, null=True)
    transitname = models.CharField(max_length=500, blank=True, null=True)
    date_field = models.DateTimeField(db_column='date_', blank=True, null=True)  # Field renamed because it ended with '_'.

    class Meta:
        managed = False
        db_table = 'tbltransitorderline'


class Tblvendor(models.Model):
    vendorid = models.AutoField(primary_key=True)
    vendorname = models.CharField(max_length=200, blank=True, null=True)
    registernumber = models.CharField(max_length=20, blank=True, null=True)
    isvatpayer = models.IntegerField(blank=True, null=True)
    vendortypeid = models.IntegerField(blank=True, null=True)
    countryname = models.CharField(max_length=200, blank=True, null=True)
    establisheddate = models.DateTimeField(blank=True, null=True)
    activity = models.CharField(max_length=500, blank=True, null=True)
    vendorstatusid = models.IntegerField(blank=True, null=True)
    address = models.CharField(max_length=500, blank=True, null=True)
    vendorphone = models.CharField(max_length=100, blank=True, null=True)
    vendoremail = models.CharField(max_length=200, blank=True, null=True)
    bankname = models.CharField(max_length=200, blank=True, null=True)
    bankaccountname = models.CharField(max_length=200, blank=True, null=True)
    bankaccountnumber = models.CharField(max_length=200, blank=True, null=True)
    created = models.CharField(max_length=100, blank=True, null=True)
    empname = models.CharField(max_length=200, blank=True, null=True)
    empphone = models.CharField(max_length=200, blank=True, null=True)
    empemail = models.CharField(max_length=200, blank=True, null=True)
    updated = models.CharField(max_length=100, blank=True, null=True)
    headcompany = models.CharField(max_length=200, blank=True, null=True)
    website = models.CharField(max_length=200, blank=True, null=True)
    shareholder = models.CharField(max_length=200, blank=True, null=True)
    verification = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblvendor'


class Tblvendoractivity(models.Model):
    activityid = models.AutoField(primary_key=True)
    activity = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblvendoractivity'


class Tblvendorcategoryrel(models.Model):
    vendorid = models.ForeignKey(Tblvendor, models.DO_NOTHING, db_column='vendorid', blank=True, null=True)
    erpcategoryid = models.IntegerField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'tblvendorcategoryrel'


class VendorActivityRelation(models.Model):
    vendorid = models.BigIntegerField(db_index=True)
    activityid = models.IntegerField(db_index=True)

    class Meta:
        db_table = 'vendor_activity_relation'
        constraints = [
            models.UniqueConstraint(
                fields=['vendorid', 'activityid'],
                name='unique_vendor_activity_relation',
            )
        ]


class TenderActivityRelation(models.Model):
    tenderid = models.BigIntegerField(db_index=True)
    activityid = models.IntegerField(db_index=True)

    class Meta:
        db_table = 'tender_activity_relation'
        constraints = [
            models.UniqueConstraint(
                fields=['tenderid', 'activityid'],
                name='unique_tender_activity_relation',
            )
        ]


class TenderInvitationRecipient(models.Model):
    invitationid = models.BigIntegerField(db_index=True)
    tenderid = models.BigIntegerField(db_index=True)
    vendorid = models.BigIntegerField(db_index=True)
    vendorname = models.CharField(max_length=200, blank=True, default='')
    email = models.EmailField(max_length=254)
    matched_activity_ids = models.JSONField(default=list)
    delivery_status = models.CharField(max_length=20, default='queued', db_index=True)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    queued_at = models.DateTimeField(default=timezone.now)
    sent_at = models.DateTimeField(blank=True, null=True)
    last_error = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'tender_invitation_recipient'
        constraints = [
            models.UniqueConstraint(
                fields=['invitationid', 'vendorid'],
                name='unique_tender_invitation_recipient',
            )
        ]

class TenderEvaluationStatus(models.Model):
    id = models.AutoField(primary_key=True)
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)

    class Meta:
        db_table = "tender_evaluation_status"
class TenderVendorEvaluation(models.Model):
    id = models.AutoField(primary_key=True)

    tenderid = models.IntegerField()
    vendorid = models.IntegerField()
    invitationid = models.IntegerField()

    status = models.ForeignKey(
        TenderEvaluationStatus,
        on_delete=models.PROTECT,
        db_column="statusid",
        related_name="evaluations",
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tender_vendor_evaluation"
        constraints = [
            models.UniqueConstraint(
                fields=["tenderid", "vendorid"],
                name="unique_tender_vendor_evaluation",
            )
        ]
