'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import {
  Building2,
  CheckCircle,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Save,
  User,
} from 'lucide-react';
import {
  type CompanyFormData,
  companyStatusOptions,
  countryValueFromStoredName,
  countryOptions,
  emptyCompanyFormData,
  entityTypeOptions,
  getOptionLabel,
  validateAllCompanyFields,
} from '@/lib/company-form';
import { cn } from '@/lib/utils';
import {
  fetchVendorActivities,
  fetchVendorProfile,
  updateVendorProfile,
  type VendorActivity,
  type VendorProfileRecord,
} from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

export default function ProfilePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState<CompanyFormData>(emptyCompanyFormData);
  const [vendorRecord, setVendorRecord] = useState<VendorProfileRecord | null>(null);
  const [saveError, setSaveError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activities, setActivities] = useState<VendorActivity[]>([]);

  useEffect(() => {
    const user = getStoredUser();
    if (!user?.vendorId) return;
    void Promise.all([fetchVendorProfile(user.vendorId), fetchVendorActivities()])
      .then(([record, activityRows]) => {
        setVendorRecord(record);
        setActivities(activityRows);
        const vendorType = Number(record.vendortypeid ?? 1);
        const activityName = String(record.activity ?? '')
          .trim()
          .toLocaleLowerCase('mn');
        const storedActivityIds = Array.isArray(record.activityids)
          ? record.activityids
              .map((value) => Number(value))
              .filter((value) => Number.isInteger(value) && value > 0)
              .map(String)
          : [];
        const legacyActivityId = String(
          activityRows.find(
            (activity) => activity.activity.trim().toLocaleLowerCase('mn') === activityName
          )?.activityid ?? ''
        );
        setProfile({
          entityType: vendorType === 2 ? 'individual' : vendorType === 3 ? 'foreign' : 'company',
          country: countryValueFromStoredName(String(record.countryname ?? '')),
          companyName: String(record.vendorname ?? ''),
          registrationNumber: String(record.registernumber ?? ''),
          isVatPayer: Number(record.isvatpayer ?? 0) === 1,
          companyStatus:
            Number(record.vendorstatusid ?? 1) === 2
              ? 'suspended'
              : Number(record.vendorstatusid ?? 1) === 3
                ? 'inactive'
                : 'active',
          businessDirections:
            storedActivityIds.length > 0
              ? storedActivityIds
              : legacyActivityId
                ? [legacyActivityId]
                : [],
          foundedDate: String(record.establisheddate ?? '').replaceAll('.', '-'),
          companyAddress: String(record.address ?? ''),
          companyPhone: String(record.vendorphone ?? ''),
          companyEmail: String(record.vendoremail ?? ''),
          parentCompany: String(record.headcompany ?? ''),
          shareholders: String(record.shareholder ?? ''),
          website: String(record.website ?? ''),
          contactName: String(record.empname ?? ''),
          contactPhone: String(record.empphone ?? ''),
          contactEmail: String(record.empemail ?? ''),
          username: user.username,
          password: 'unchanged',
          confirmPassword: 'unchanged',
        });
      })
      .catch((requestError) =>
        setSaveError(
          requestError instanceof Error ? requestError.message : 'Профайл ачаалж чадсангүй.'
        )
      );
  }, []);

  const updateField = <K extends keyof CompanyFormData>(field: K, value: CompanyFormData[K]) => {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
    setSaved(false);
    setErrors((current) => {
      if (!current[field] && field !== 'password' && field !== 'confirmPassword') {
        return current;
      }

      const next = { ...current };
      delete next[field];

      if (field === 'password' || field === 'confirmPassword') {
        delete next.confirmPassword;
      }

      return next;
    });
  };

  const getFieldClass = (
    field: keyof CompanyFormData,
    options?: { hasIcon?: boolean; textarea?: boolean }
  ) =>
    cn(
      options?.textarea ? 'min-h-24 resize-none' : 'h-11',
      options?.hasIcon && 'pl-10',
      errors[field] ? 'border-red-500 focus-visible:ring-red-500' : 'focus-visible:ring-primary/30'
    );

  const getSelectClass = (field: keyof CompanyFormData) =>
    cn('h-11', errors[field] ? 'border-red-500 focus:ring-red-500' : 'focus:ring-primary/30');

  const renderError = (field: keyof CompanyFormData) =>
    errors[field] ? <p className="text-xs font-medium text-red-500">{errors[field]}</p> : null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors = validateAllCompanyFields(profile);
    if (
      !profile.businessDirections.length ||
      profile.businessDirections.some(
        (selected) => !activities.some((activity) => String(activity.activityid) === selected)
      )
    ) {
      nextErrors.businessDirections = 'Үйл ажиллагааны чиглэлээ жагсаалтаас сонгоно уу';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsLoading(true);
    setSaved(false);
    setSaveError('');
    const user = getStoredUser();
    if (!user?.vendorId || !vendorRecord) {
      setSaveError('Нийлүүлэгчийн session олдсонгүй.');
      setIsLoading(false);
      return;
    }
    try {
      await updateVendorProfile(profile, user.vendorId, vendorRecord);
      setVendorRecord(await fetchVendorProfile(user.vendorId));
      setIsLoading(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (requestError) {
      setSaveError(
        requestError instanceof Error ? requestError.message : 'Профайл хадгалагдсангүй.'
      );
      setIsLoading(false);
    }
  };

  const entityTypeLabel =
    getOptionLabel(entityTypeOptions, profile.entityType) || 'Төрөл сонгоогүй';
  const countryLabel = getOptionLabel(countryOptions, profile.country) || 'Улс сонгоогүй';
  const statusLabel =
    getOptionLabel(companyStatusOptions, profile.companyStatus) || 'Статус сонгоогүй';
  const statusBadgeClass =
    profile.companyStatus === 'active'
      ? 'bg-emerald-100 text-emerald-700'
      : profile.companyStatus === 'suspended'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-700';

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Компанийн профайл</h1>
            <p className="mt-1 text-muted-foreground">
              Компанийн, холбоо барих болон системийн нэвтрэх мэдээллээ удирдана уу.
            </p>
          </div>
          <Badge variant="secondary" className="w-fit bg-emerald-100 text-emerald-700">
            <CheckCircle className="mr-1 h-3 w-3" />
            Баталгаажсан нийлүүлэгч
          </Badge>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_340px]">
          <form className="space-y-6" onSubmit={handleSave}>
            {saveError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {saveError}
              </div>
            )}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-lg">Компанийн мэдээлэл</CardTitle>
                <CardDescription className="space-y-1">
                  <span className="block">
                    Байгууллагын үндсэн бүртгэл, статус болон холбоо барих сувгууд.
                  </span>
                  <span className="block text-xs font-medium text-orange-600">
                    * тэмдэгтэй талбарууд заавал бөглөгдөнө.
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="entityType">
                      Төрөл<span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={profile.entityType || undefined}
                      onValueChange={(value) => updateField('entityType', value)}
                    >
                      <SelectTrigger id="entityType" className={getSelectClass('entityType')}>
                        <SelectValue placeholder="Сонгох..." />
                      </SelectTrigger>
                      <SelectContent>
                        {entityTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {renderError('entityType')}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="country">
                      Улс<span className="text-red-500">*</span>
                    </Label>
                    <SearchableSelect
                      id="country"
                      value={profile.country}
                      options={countryOptions}
                      onValueChange={(value) => updateField('country', value)}
                      placeholder="Улс сонгох..."
                      searchPlaceholder="Улсын нэр эсвэл кодоор хайх..."
                      emptyMessage="Улс олдсонгүй."
                      invalid={Boolean(errors.country)}
                      className={getSelectClass('country')}
                    />
                    {renderError('country')}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">
                      Компанийн нэр<span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Building2
                        className={cn(
                          'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
                          errors.companyName ? 'text-red-500' : 'text-muted-foreground'
                        )}
                      />
                      <Input
                        id="companyName"
                        value={profile.companyName}
                        onChange={(e) => updateField('companyName', e.target.value)}
                        className={getFieldClass('companyName', { hasIcon: true })}
                      />
                    </div>
                    {renderError('companyName')}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="registrationNumber">
                      Регистрийн дугаар<span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <FileText
                        className={cn(
                          'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
                          errors.registrationNumber ? 'text-red-500' : 'text-muted-foreground'
                        )}
                      />
                      <Input
                        id="registrationNumber"
                        value={profile.registrationNumber}
                        onChange={(e) => updateField('registrationNumber', e.target.value)}
                        className={getFieldClass('registrationNumber', {
                          hasIcon: true,
                        })}
                      />
                    </div>
                    {renderError('registrationNumber')}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyStatus">Компанийн статус</Label>
                    <Select
                      value={profile.companyStatus || undefined}
                      onValueChange={(value) => updateField('companyStatus', value)}
                    >
                      <SelectTrigger id="companyStatus" className={getSelectClass('companyStatus')}>
                        <SelectValue placeholder="Сонгох..." />
                      </SelectTrigger>
                      <SelectContent>
                        {companyStatusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="isVatPayer">НӨАТ төлөгч эсэх</Label>
                    <div className="flex h-11 items-center justify-between rounded-md border border-border bg-background px-3">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-foreground">НӨАТ төлөгч</p>
                        <p className="text-xs text-muted-foreground">
                          {profile.isVatPayer ? 'Тийм' : 'Үгүй'}
                        </p>
                      </div>
                      <Switch
                        id="isVatPayer"
                        checked={profile.isVatPayer}
                        onCheckedChange={(checked) => updateField('isVatPayer', checked)}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="businessDirection">
                      Үйл ажиллагааны чиглэл<span className="text-red-500">*</span>
                    </Label>
                    <SearchableMultiSelect
                      id="businessDirection"
                      value={profile.businessDirections}
                      options={activities.map((activity) => ({
                        value: String(activity.activityid),
                        label: activity.activity,
                      }))}
                      onValueChange={(value) => updateField('businessDirections', value)}
                      placeholder="Чиглэл сонгох..."
                      searchPlaceholder="Үйл ажиллагааны чиглэл хайх..."
                      emptyMessage="Чиглэл олдсонгүй."
                      disabled={!activities.length}
                      invalid={Boolean(errors.businessDirections)}
                      className={getSelectClass('businessDirections')}
                    />
                    {renderError('businessDirections')}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="foundedDate">
                      Компани байгуулагдсан огноо
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="foundedDate"
                      type="date"
                      value={profile.foundedDate}
                      onChange={(e) => updateField('foundedDate', e.target.value)}
                      className={getFieldClass('foundedDate')}
                    />
                    {renderError('foundedDate')}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyAddress">
                    Компанийн хаяг<span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <MapPin
                      className={cn(
                        'absolute left-3 top-3 h-4 w-4',
                        errors.companyAddress ? 'text-red-500' : 'text-muted-foreground'
                      )}
                    />
                    <Textarea
                      id="companyAddress"
                      value={profile.companyAddress}
                      onChange={(e) => updateField('companyAddress', e.target.value)}
                      className={getFieldClass('companyAddress', {
                        hasIcon: true,
                        textarea: true,
                      })}
                    />
                  </div>
                  {renderError('companyAddress')}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyPhone">
                      Байгууллагын утас<span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Phone
                        className={cn(
                          'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
                          errors.companyPhone ? 'text-red-500' : 'text-muted-foreground'
                        )}
                      />
                      <Input
                        id="companyPhone"
                        value={profile.companyPhone}
                        onChange={(e) => updateField('companyPhone', e.target.value)}
                        className={getFieldClass('companyPhone', { hasIcon: true })}
                      />
                    </div>
                    {renderError('companyPhone')}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyEmail">
                      Байгууллагын и-мэйл хаяг
                      <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Mail
                        className={cn(
                          'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
                          errors.companyEmail ? 'text-red-500' : 'text-muted-foreground'
                        )}
                      />
                      <Input
                        id="companyEmail"
                        type="email"
                        value={profile.companyEmail}
                        onChange={(e) => updateField('companyEmail', e.target.value)}
                        className={getFieldClass('companyEmail', { hasIcon: true })}
                      />
                    </div>
                    {renderError('companyEmail')}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="parentCompany">Толгой компани</Label>
                    <Input
                      id="parentCompany"
                      value={profile.parentCompany}
                      onChange={(e) => updateField('parentCompany', e.target.value)}
                      className={getFieldClass('parentCompany')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="shareholders">Хувьцаа эзэмшигч</Label>
                    <Input
                      id="shareholders"
                      value={profile.shareholders}
                      onChange={(e) => updateField('shareholders', e.target.value)}
                      className={getFieldClass('shareholders')}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">Вэб сайт</Label>
                  <Input
                    id="website"
                    type="url"
                    value={profile.website}
                    onChange={(e) => updateField('website', e.target.value)}
                    className={getFieldClass('website')}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-lg">Холбоо барих ажилтны мэдээлэл</CardTitle>
                <CardDescription>
                  Тендерийн харилцаа хариуцах үндсэн ажилтны мэдээлэл.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="contactName">
                    Нэр<span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <User
                      className={cn(
                        'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
                        errors.contactName ? 'text-red-500' : 'text-muted-foreground'
                      )}
                    />
                    <Input
                      id="contactName"
                      value={profile.contactName}
                      onChange={(e) => updateField('contactName', e.target.value)}
                      className={getFieldClass('contactName', { hasIcon: true })}
                    />
                  </div>
                  {renderError('contactName')}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contactPhone">
                      Утас<span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Phone
                        className={cn(
                          'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
                          errors.contactPhone ? 'text-red-500' : 'text-muted-foreground'
                        )}
                      />
                      <Input
                        id="contactPhone"
                        value={profile.contactPhone}
                        onChange={(e) => updateField('contactPhone', e.target.value)}
                        className={getFieldClass('contactPhone', { hasIcon: true })}
                      />
                    </div>
                    {renderError('contactPhone')}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactEmail">
                      И-мэйл хаяг<span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Mail
                        className={cn(
                          'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
                          errors.contactEmail ? 'text-red-500' : 'text-muted-foreground'
                        )}
                      />
                      <Input
                        id="contactEmail"
                        type="email"
                        value={profile.contactEmail}
                        onChange={(e) => updateField('contactEmail', e.target.value)}
                        className={getFieldClass('contactEmail', { hasIcon: true })}
                      />
                    </div>
                    {renderError('contactEmail')}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-lg">Нэвтрэх бүртгэл</CardTitle>
                <CardDescription>Системд нэвтэрсэн хэрэглэгчийн нэр.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">
                    Системд нэвтрэх нэр<span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="username"
                    value={profile.username}
                    readOnly
                    className={cn(getFieldClass('username'), 'bg-slate-50')}
                  />
                  {renderError('username')}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Хадгалж байна...
                  </>
                ) : saved ? (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Хадгаллаа
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Өөрчлөлт хадгалах
                  </>
                )}
              </Button>
            </div>
          </form>

          <div className="space-y-6">
            <Card className="border-border/60">
              <CardContent className="p-6 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                  <Building2 className="h-10 w-10 text-primary" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {profile.companyName || 'Компанийн нэр оруулаагүй'}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{entityTypeLabel}</p>
                <div className="mt-4 space-y-2 text-left text-sm text-muted-foreground">
                  <div className="flex justify-between gap-4">
                    <span>Улс</span>
                    <span className="text-right font-medium text-foreground">{countryLabel}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Статус</span>
                    <span className="text-right font-medium text-foreground">{statusLabel}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>НӨАТ</span>
                    <span className="text-right font-medium text-foreground">
                      {profile.isVatPayer ? 'Төлөгч' : 'Төлөгч биш'}
                    </span>
                  </div>
                </div>
                <Badge variant="secondary" className={cn('mt-4', statusBadgeClass)}>
                  {statusLabel}
                </Badge>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Товч мэдээлэл</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between gap-4">
                  <span className="text-sm text-muted-foreground">И-мэйл</span>
                  <span className="text-right text-sm font-medium text-foreground">
                    {profile.companyEmail || '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Утас</span>
                  <span className="text-right text-sm font-medium text-foreground">
                    {profile.companyPhone || '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Вэб сайт</span>
                  <span className="text-right text-sm font-medium text-foreground">
                    {profile.website || '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Холбоо барих ажилтан</span>
                  <span className="text-right text-sm font-medium text-foreground">
                    {profile.contactName || '-'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
