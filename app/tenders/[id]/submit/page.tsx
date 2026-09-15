'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Package,
  Send,
  Upload,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuthState } from '@/hooks/use-auth-state';
import { useTenderDetail } from '@/hooks/use-tenders';
import { getLoginRedirectPath, getStoredUser } from '@/lib/auth';
import { fetchQuotes, joinTender, saveQuote, uploadTenderJoinDocument } from '@/lib/api';
import { cn } from '@/lib/utils';
import { statusConfig } from '@/lib/tender-data';

type QuoteForm = {
  batchId: string;
  quoteDate: string;
  quoteAmount: string;
  deliveryDate: string;
  deliveryDays: string;
  confirm: boolean;
};

const steps = [
  { id: 1, label: 'Оролцох багц' },
  { id: 2, label: 'Үнийн санал' },
  { id: 3, label: 'Баримт бичиг' },
  { id: 4, label: 'Баталгаажуулах' },
];

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('mn-MN', { maximumFractionDigits: 0 }).format(value)} ₮`;
}

export default function SubmitQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { isAuthenticated, isReady } = useAuthState();
  const {
    tender,
    loading: tenderLoading,
    error: tenderError,
    reload,
  } = useTenderDetail(Number(id));
  const [step, setStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [participating, setParticipating] = useState(false);
  const [files, setFiles] = useState<{ name: string; size: string; file?: File }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<QuoteForm>({
    batchId: '',
    quoteDate: new Date().toISOString().slice(0, 10),
    quoteAmount: '',
    deliveryDate: '',
    deliveryDays: '',
    confirm: false,
  });

  const isOpen = tender?.status === 'open' || tender?.status === 'closing-soon';
  const selectedBatch = tender?.batches.find((batch) => String(batch.id) === form.batchId);
  const requiredDocumentCount =
    tender?.requirements.filter((item) => item.documentRequired).length ?? 0;

  useEffect(() => {
    if (isReady && !isAuthenticated) router.replace(getLoginRedirectPath(`/tenders/${id}/submit`));
    if (!tenderLoading && isReady && isAuthenticated && !isOpen) router.replace(`/tenders/${id}`);
  }, [id, isAuthenticated, isOpen, isReady, router, tenderLoading]);

  useEffect(() => {
    const user = getStoredUser();
    if (!tender || user?.role !== 'vendor' || !user.vendorId) return;
    void fetchQuotes(tender.invitationId, user.vendorId)
      .then((quotes) => {
        const existing = quotes[0];
        if (!existing) return;
        setParticipating(true);
        setForm((current) => ({
          ...current,
          batchId: String(tender.batches[0]?.id ?? 0),
          quoteDate: existing.qoutedate?.replaceAll('.', '-') ?? current.quoteDate,
          quoteAmount: String(existing.qouteamount ?? ''),
          deliveryDate: existing.deliverydate?.replaceAll('.', '-') ?? '',
          deliveryDays: String(existing.deliveryday ?? ''),
        }));
      })
      .catch((requestError) =>
        setErrors({
          submit:
            requestError instanceof Error ? requestError.message : 'Өмнөх санал ачаалж чадсангүй.',
        })
      );
  }, [tender]);

  const moneyPreview = useMemo(() => {
    const amount = Number(form.quoteAmount.replaceAll(',', ''));
    return Number.isFinite(amount) && amount > 0 ? formatMoney(amount) : '0 ₮';
  }, [form.quoteAmount]);

  if (tenderLoading || !isReady)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  if (tenderError || !tender)
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
        <p className="font-semibold text-red-700">
          {tenderError || 'Тендерийн мэдээлэл олдсонгүй.'}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => void reload()}>
          Дахин оролдох
        </Button>
      </div>
    );
  if (!isAuthenticated || !isOpen) return null;

  const update = <K extends keyof QuoteForm>(key: K, value: QuoteForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const validateStep = () => {
    const next: Record<string, string> = {};
    if (step === 1 && !form.batchId) next.batchId = 'Оролцох багцаа сонгоно уу.';
    if (step === 2) {
      if (!form.quoteDate) next.quoteDate = 'Саналын огноо шаардлагатай.';
      if (!form.quoteAmount || Number(form.quoteAmount.replaceAll(',', '')) <= 0)
        next.quoteAmount = 'Үнийн саналын дүнг зөв оруулна уу.';
      if (!form.deliveryDate) next.deliveryDate = 'Хүргэлтийн огноо шаардлагатай.';
      if (!form.deliveryDays || Number(form.deliveryDays) <= 0)
        next.deliveryDays = 'Хүргэлтийн хоногийг зөв оруулна уу.';
    }
    if (step === 3 && files.length < requiredDocumentCount)
      next.files = `Нотлох баримтаас багадаа ${requiredDocumentCount} файл хавсаргана уу.`;
    if (step === 4 && !form.confirm) next.confirm = 'Мэдээллийн үнэн зөвийг баталгаажуулна уу.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const nextStep = () => {
    if (!validateStep()) return;
    setStep((current) => Math.min(current + 1, 4));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const uploadFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const oversized = selected.find((file) => file.size > 10 * 1024 * 1024);
    if (oversized) {
      setErrors((current) => ({ ...current, files: `${oversized.name} файл 10MB-аас их байна.` }));
      return;
    }
    setFiles((current) => [
      ...current,
      ...selected.map((file) => ({
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        file,
      })),
    ]);
    setErrors((current) => {
      const next = { ...current };
      delete next.files;
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateStep() || !selectedBatch) return;
    const user = getStoredUser();
    if (!user?.vendorId) return router.push(getLoginRedirectPath(`/tenders/${id}/submit`));
    setIsSaving(true);
    setErrors((current) => {
      const next = { ...current };
      delete next.submit;
      return next;
    });
    try {
      const existingQuotes = await fetchQuotes(tender.invitationId, user.vendorId);
      for (const selectedFile of files) {
        if (!selectedFile.file) continue;
        await uploadTenderJoinDocument({
          file: selectedFile.file,
          invitationId: tender.invitationId,
          tenderId: tender.tenderId,
          vendorId: user.vendorId,
          createdBy: user.username,
          batchId: selectedBatch.id,
        });
      }
      if (!participating)
        await joinTender({
          invitationId: tender.invitationId,
          tenderId: tender.tenderId,
          vendorId: user.vendorId,
          createdBy: user.username,
        });
      await saveQuote({
        quoteId: existingQuotes[0]?.qouteid,
        quoteDate: form.quoteDate,
        quoteAmount: Number(form.quoteAmount.replaceAll(',', '')),
        deliveryDate: form.deliveryDate,
        deliveryDays: Number(form.deliveryDays),
        invitationId: tender.invitationId,
        tenderId: tender.tenderId,
        batchId: selectedBatch.id,
        vendorId: user.vendorId,
        createdBy: user.username,
      });
      router.push(`/tenders/${id}?submitted=true`);
    } catch (requestError) {
      setErrors((current) => ({
        ...current,
        submit:
          requestError instanceof Error ? requestError.message : 'Үнийн санал хадгалагдсангүй.',
      }));
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 lg:py-10">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Link
          href={`/tenders/${id}`}
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Тендерийн дэлгэрэнгүй рүү буцах
        </Link>

        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusConfig[tender.status].className}>
                {statusConfig[tender.status].label}
              </Badge>
              <span className="text-sm text-slate-500">{tender.invitationCode}</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">Үнийн санал илгээх</h1>
            <p className="mt-1 text-slate-600">{tender.title}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-medium">Эцсийн хугацаа:</span> {tender.deadline}
          </div>
        </div>

        <div className="mb-8 grid grid-cols-4 gap-2">
          {steps.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => item.id < step && setStep(item.id)}
              className="text-left"
            >
              <div
                className={cn(
                  'h-1.5 rounded-full',
                  item.id <= step ? 'bg-orange-500' : 'bg-slate-200'
                )}
              />
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                    item.id < step
                      ? 'bg-orange-500 text-white'
                      : item.id === step
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-slate-200 text-slate-500'
                  )}
                >
                  {item.id < step ? <Check className="h-3.5 w-3.5" /> : item.id}
                </span>
                <span className="hidden text-sm font-medium text-slate-700 sm:inline">
                  {item.label}
                </span>
              </div>
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          {step === 1 && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-orange-500" />
                  Оролцох багцаа сонгох
                </CardTitle>
                <CardDescription>Багц бүрд тусдаа үнийн санал хадгалагдана.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  {tender.batches.map((batch) => (
                    <button
                      key={batch.id}
                      type="button"
                      onClick={() => update('batchId', String(batch.id))}
                      className={cn(
                        'flex items-center justify-between rounded-xl border p-4 text-left transition-colors',
                        form.batchId === String(batch.id)
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-slate-200 hover:border-slate-300'
                      )}
                    >
                      <div>
                        <p className="text-xs font-semibold text-orange-600">{batch.code}</p>
                        <p className="mt-1 font-medium text-slate-900">{batch.name}</p>
                      </div>
                      <div
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full border',
                          form.batchId === String(batch.id)
                            ? 'border-orange-500 bg-orange-500 text-white'
                            : 'border-slate-300'
                        )}
                      >
                        {form.batchId === String(batch.id) && <Check className="h-3 w-3" />}
                      </div>
                    </button>
                  ))}
                </div>
                {errors.batchId && <p className="text-sm text-red-600">{errors.batchId}</p>}
                <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <p>
                    {participating
                      ? 'Таны оролцоо backend-д бүртгэгдсэн байна.'
                      : 'Баримт болон үнийн саналыг баталгаажуулах үед оролцоо backend-д бүртгэгдэнэ.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Үнийн санал, хүргэлт</CardTitle>
                <CardDescription>
                  Үнийн дүн, саналын огноо, хүргэлтийн огноо болон хоногийг оруулна.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <Field label="Саналын огноо" error={errors.quoteDate}>
                  <Input
                    type="date"
                    value={form.quoteDate}
                    onChange={(event) => update('quoteDate', event.target.value)}
                  />
                </Field>
                <Field label="Үнийн саналын дүн (₮)" error={errors.quoteAmount}>
                  <Input
                    inputMode="numeric"
                    value={form.quoteAmount}
                    onChange={(event) =>
                      update('quoteAmount', event.target.value.replace(/[^0-9]/g, ''))
                    }
                    placeholder="145000000"
                  />
                  <p className="text-xs font-medium text-orange-600">{moneyPreview}</p>
                </Field>
                <Field label="Хүргэлтийн огноо" error={errors.deliveryDate}>
                  <Input
                    type="date"
                    value={form.deliveryDate}
                    onChange={(event) => update('deliveryDate', event.target.value)}
                  />
                </Field>
                <Field label="Хүргэлтийн хугацаа (хоног)" error={errors.deliveryDays}>
                  <Input
                    type="number"
                    min="1"
                    value={form.deliveryDays}
                    onChange={(event) => update('deliveryDays', event.target.value)}
                    placeholder="30"
                  />
                </Field>
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-orange-500" />
                  Нотлох баримт хавсаргах
                </CardTitle>
                <CardDescription>
                  Шаардлагын дагуу багадаа {requiredDocumentCount} файл хавсаргана. Файл тус бүр
                  10MB хүртэл.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <Upload className="mx-auto h-9 w-9 text-slate-400" />
                  <p className="mt-3 text-sm font-medium text-slate-700">
                    PDF, DOCX, XLSX файл сонгоно уу
                  </p>
                  <Button type="button" variant="outline" className="mt-4" asChild>
                    <label className="cursor-pointer">
                      Файл сонгох
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                        className="hidden"
                        onChange={uploadFiles}
                      />
                    </label>
                  </Button>
                </div>
                {errors.files && (
                  <p className="flex items-center gap-2 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    {errors.files}
                  </p>
                )}
                <div className="space-y-2">
                  {files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between rounded-xl border border-slate-200 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText className="h-5 w-5 shrink-0 text-orange-500" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
                          <p className="text-xs text-slate-500">{file.size}</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setFiles((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index)
                          )
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {step === 4 && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Мэдээллээ шалгаж баталгаажуулах</CardTitle>
                <CardDescription>
                  Илгээсний дараа хугацаа дуусахаас өмнө саналаа засах боломжтой.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <dl className="grid gap-4 rounded-xl bg-slate-50 p-5 text-sm sm:grid-cols-2">
                  <Summary label="Багц" value={selectedBatch?.name ?? '—'} />
                  <Summary label="Үнийн санал" value={moneyPreview} />
                  <Summary label="Саналын огноо" value={form.quoteDate} />
                  <Summary label="Хүргэлтийн огноо" value={form.deliveryDate} />
                  <Summary label="Хүргэлтийн хугацаа" value={`${form.deliveryDays} хоног`} />
                  <Summary label="Хавсаргасан файл" value={`${files.length} файл`} />
                </dl>
                <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
                  <Checkbox
                    id="confirm"
                    checked={form.confirm}
                    onCheckedChange={(checked) => update('confirm', checked === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="confirm" className="cursor-pointer font-normal leading-6">
                    Оруулсан мэдээлэл, хавсаргасан баримт бичиг үнэн зөв бөгөөд тендерийн нөхцөлийг
                    хүлээн зөвшөөрч байгаагаа баталж байна.
                  </Label>
                </div>
                {errors.confirm && <p className="text-sm text-red-600">{errors.confirm}</p>}
              </CardContent>
            </Card>
          )}

          {errors.submit && (
            <p className="mt-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              {errors.submit}
            </p>
          )}
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={step === 1 || isSaving}
              onClick={() => setStep((current) => Math.max(current - 1, 1))}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Өмнөх
            </Button>
            {step < 4 ? (
              <Button
                type="button"
                onClick={nextStep}
                className="bg-orange-500 hover:bg-orange-600"
              >
                Үргэлжлүүлэх
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isSaving}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {isSaving ? 'Хадгалж байна...' : 'Санал илгээх'}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        <span className="text-red-500">*</span>
      </Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
