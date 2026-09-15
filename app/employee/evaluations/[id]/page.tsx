'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  Save,
  Search,
  Users,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { DataPagination } from '@/components/data-pagination';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchEvaluationCriteria,
  fetchEvaluationVendors,
  fetchMyEmployeePermission,
  fetchTenderDetail,
  saveEvaluationScores,
  type EvaluationCriterion,
  type EvaluationVendor,
} from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import type { Tender } from '@/lib/tender-data';

function formatMoney(value: number | string | null | undefined) {
  return `${new Intl.NumberFormat('mn-MN', { maximumFractionDigits: 0 }).format(Number(value ?? 0))} ₮`;
}

function criterionLabel(criterion: EvaluationCriterion) {
  return criterion.criterianame?.trim() || criterion.criteriatypename?.trim() || 'Нэргүй шалгуур';
}

export default function EvaluationDetailPage() {
  const params = useParams<{ id: string }>();
  const invitationId = Number(params.id);
  const [tender, setTender] = useState<Tender | null>(null);
  const [vendors, setVendors] = useState<EvaluationVendor[]>([]);
  const [criteria, setCriteria] = useState<EvaluationCriterion[]>([]);
  const [scores, setScores] = useState<Record<number, string>>({});
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [criteriaLoading, setCriteriaLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [vendorPage, setVendorPage] = useState(1);
  const [vendorPageSize, setVendorPageSize] = useState(8);
  const user = getStoredUser();
  const employeeId = user?.employeeId ?? user?.userId ?? 0;

  useEffect(() => {
    let cancelled = false;
    if (!employeeId) {
      setError('Нэвтэрсэн ажилтны бодит ID олдсонгүй. Дахин нэвтэрнэ үү.');
      setLoading(false);
      return;
    }
    if (!Number.isFinite(invitationId) || invitationId <= 0) {
      setError('Тендерийн урилгын дугаар буруу байна.');
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const permission = await fetchMyEmployeePermission();
        if (!permission.isAdmin && !permission.isTenderEvaluate) {
          throw new Error('Үнэлгээ өгөх эрхгүй байна.');
        }
        const [tenderData, vendorData] = await Promise.all([
          fetchTenderDetail(invitationId),
          fetchEvaluationVendors(invitationId, employeeId),
        ]);
        if (!cancelled) {
          setTender(tenderData);
          setVendors(vendorData);
          setSelectedVendorId(vendorData[0]?.vendorid ?? null);
        }
      } catch (requestError) {
        if (!cancelled)
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Үнэлгээний мэдээллийг ачаалж чадсангүй.'
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [employeeId, invitationId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedVendorId) {
      setCriteria([]);
      setScores({});
      return;
    }

    const loadCriteria = async () => {
      setCriteriaLoading(true);
      setError('');
      setNotice('');
      try {
        const rows = await fetchEvaluationCriteria(invitationId, selectedVendorId, employeeId);
        if (!cancelled) {
          setCriteria(rows);
          setScores(
            Object.fromEntries(
              rows.map((criterion) => [
                criterion.criteriaid,
                criterion.result == null ? '' : String(criterion.result),
              ])
            )
          );
        }
      } catch (requestError) {
        if (!cancelled)
          setError(
            requestError instanceof Error ? requestError.message : 'Үнэлгээний шалгуур ачаалсангүй.'
          );
      } finally {
        if (!cancelled) setCriteriaLoading(false);
      }
    };
    void loadCriteria();
    return () => {
      cancelled = true;
    };
  }, [employeeId, invitationId, selectedVendorId]);

  const filteredVendors = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return vendors;
    return vendors.filter((vendor) =>
      `${vendor.vendorname ?? ''} ${vendor.vendorid}`.toLowerCase().includes(normalized)
    );
  }, [query, vendors]);
  const vendorPageCount = Math.max(1, Math.ceil(filteredVendors.length / vendorPageSize));
  const visibleVendors = useMemo(
    () => filteredVendors.slice((vendorPage - 1) * vendorPageSize, vendorPage * vendorPageSize),
    [filteredVendors, vendorPage, vendorPageSize]
  );
  useEffect(() => {
    if (vendorPage > vendorPageCount) setVendorPage(vendorPageCount);
  }, [vendorPage, vendorPageCount]);

  const selectedVendor = vendors.find((vendor) => vendor.vendorid === selectedVendorId);
  const maximumScore = criteria.reduce(
    (total, criterion) => total + Number(criterion.weight ?? 0),
    0
  );
  const currentScore = criteria.reduce(
    (total, criterion) => total + (Number(scores[criterion.criteriaid]) || 0),
    0
  );
  const scoreProgress = maximumScore
    ? Math.min(100, Math.round((currentScore / maximumScore) * 100))
    : 0;

  const save = async () => {
    if (!selectedVendorId || !criteria.length) return;
    const invalid = criteria.find((criterion) => {
      const value = Number(scores[criterion.criteriaid]);
      const maximum = Number(criterion.weight ?? 0);
      return (
        scores[criterion.criteriaid] === '' ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > maximum
      );
    });
    if (invalid) {
      setError(`“${criterionLabel(invalid)}” оноо 0-${Number(invalid.weight ?? 0)} хооронд байна.`);
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      await saveEvaluationScores({
        invitationId,
        vendorId: selectedVendorId,
        employeeId,
        createdBy: user?.username ?? '',
        scores: criteria.map((criterion) => ({
          criteriaId: criterion.criteriaid,
          result: Number(scores[criterion.criteriaid]),
        })),
      });
      setVendors((current) =>
        current.map((vendor) =>
          vendor.vendorid === selectedVendorId ? { ...vendor, totalpoint: currentScore } : vendor
        )
      );
      setNotice('Үнэлгээний оноо backend-д амжилттай хадгалагдлаа.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Үнэлгээг хадгалж чадсангүй.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3 text-slate-600">
          <Link href="/employee/evaluations">
            <ArrowLeft className="size-4" />
            Үнэлгээний жагсаалт
          </Link>
        </Button>

        {loading ? (
          <div className="space-y-6">
            <Skeleton className="h-28 w-full rounded-lg" />
            <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
              <Skeleton className="h-[560px] rounded-lg" />
              <Skeleton className="h-[560px] rounded-lg" />
            </div>
          </div>
        ) : (
          <>
            <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-0 bg-amber-50 text-amber-700">Үнэлгээ</Badge>
                    <span className="text-xs text-slate-500">{tender?.invitationCode}</span>
                  </div>
                  <h1 className="mt-3 line-clamp-2 text-xl font-bold text-slate-950 sm:text-2xl">
                    {tender?.title || `Урилга #${invitationId}`}
                  </h1>
                  <p className="mt-2 truncate text-sm text-slate-500">
                    {tender?.department} · {tender?.tenderCode}
                  </p>
                </div>
                <div className="flex shrink-0 gap-5 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Оролцогч</p>
                    <p className="mt-1 font-semibold tabular-nums text-slate-900">
                      {vendors.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Санал нээсэн</p>
                    <p className="mt-1 font-semibold text-slate-900">{tender?.openDate}</p>
                  </div>
                </div>
              </div>
            </header>

            {error && (
              <Alert variant="destructive" className="mt-5 bg-white">
                <ClipboardCheck />
                <AlertTitle>Үйлдэл амжилтгүй</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {notice && (
              <Alert className="mt-5 border-emerald-200 bg-emerald-50 text-emerald-800">
                <CheckCircle2 />
                <AlertTitle>Хадгалагдлаа</AlertTitle>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}

            <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
              <Card className="h-fit rounded-lg border-slate-200 shadow-sm lg:sticky lg:top-6">
                <CardHeader className="border-b border-slate-100">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="size-4 text-orange-600" />
                    Нийлүүлэгчид
                  </CardTitle>
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setVendorPage(1);
                      }}
                      placeholder="Нийлүүлэгч хайх"
                      className="pl-9"
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {filteredVendors.length ? (
                    <>
                      <div className="max-h-[520px] overflow-y-auto p-2">
                        {visibleVendors.map((vendor) => (
                          <button
                            key={vendor.vendorid}
                            type="button"
                            onClick={() => setSelectedVendorId(vendor.vendorid)}
                            className={`mb-1 w-full rounded-md px-3 py-3 text-left transition-colors last:mb-0 ${selectedVendorId === vendor.vendorid ? 'bg-orange-50 text-orange-900' : 'hover:bg-slate-50'}`}
                          >
                            <p className="truncate text-sm font-medium">
                              {vendor.vendorname || `Нийлүүлэгч #${vendor.vendorid}`}
                            </p>
                            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate-500">
                              <span>{vendor.countdoc ?? 0} баримт</span>
                              <span className="font-medium tabular-nums">
                                {Number(vendor.totalpoint ?? 0)} оноо
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                      <DataPagination
                        page={vendorPage}
                        pageSize={vendorPageSize}
                        totalItems={filteredVendors.length}
                        itemLabel="нийлүүлэгч"
                        busy={loading}
                        compact
                        pageSizeOptions={[8, 16, 32]}
                        onPageChange={setVendorPage}
                        onPageSizeChange={(size) => {
                          setVendorPageSize(size);
                          setVendorPage(1);
                        }}
                        className="px-3"
                      />
                    </>
                  ) : (
                    <p className="p-6 text-center text-sm text-slate-500">Нийлүүлэгч олдсонгүй.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="min-w-0 rounded-lg border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-lg">
                        {selectedVendor?.vendorname || 'Нийлүүлэгч сонгоно уу'}
                      </CardTitle>
                      <p className="mt-1 text-sm text-slate-500">
                        Шалгуур тус бүрийн зөвшөөрөгдөх дээд онооноос үнэлнэ.
                      </p>
                    </div>
                    {selectedVendor && (
                      <div className="shrink-0 text-left sm:text-right">
                        <p className="text-xs text-slate-500">Үнийн санал</p>
                        <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                          {formatMoney(selectedVendor.totalamount)}
                        </p>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {criteriaLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }, (_, index) => (
                        <Skeleton key={index} className="h-24 w-full rounded-md" />
                      ))}
                    </div>
                  ) : criteria.length ? (
                    <div>
                      <div className="mb-5 rounded-md bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs text-slate-500">Нийт оноо</p>
                            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">
                              {currentScore}{' '}
                              <span className="text-sm font-normal text-slate-500">
                                / {maximumScore}
                              </span>
                            </p>
                          </div>
                          <Badge variant="outline" className="bg-white">
                            {scoreProgress}%
                          </Badge>
                        </div>
                        <Progress
                          value={scoreProgress}
                          className="mt-3 h-1.5 bg-slate-200 [&>div]:bg-orange-500"
                        />
                      </div>
                      <div className="divide-y divide-slate-100 border-y border-slate-100">
                        {criteria.map((criterion, index) => (
                          <div
                            key={criterion.criteriaid}
                            className="grid gap-4 py-4 sm:grid-cols-[36px_minmax(0,1fr)_130px] sm:items-center"
                          >
                            <span className="flex size-8 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900">
                                {criterionLabel(criterion)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Шалгуурын жин: {Number(criterion.weight ?? 0)}
                              </p>
                            </div>
                            <div>
                              <label
                                htmlFor={`score-${criterion.criteriaid}`}
                                className="mb-1 block text-xs text-slate-500"
                              >
                                Оноо / {Number(criterion.weight ?? 0)}
                              </label>
                              <Input
                                id={`score-${criterion.criteriaid}`}
                                type="number"
                                min={0}
                                max={Number(criterion.weight ?? 0)}
                                step="0.1"
                                value={scores[criterion.criteriaid] ?? ''}
                                onChange={(event) =>
                                  setScores((current) => ({
                                    ...current,
                                    [criterion.criteriaid]: event.target.value,
                                  }))
                                }
                                className="tabular-nums"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 flex justify-end">
                        <Button
                          onClick={() => void save()}
                          disabled={saving || tender?.invitationStatusId !== 3}
                          className="bg-orange-500 text-white hover:bg-orange-600"
                        >
                          {saving ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Save className="size-4" />
                          )}
                          {saving ? 'Хадгалж байна' : 'Үнэлгээ хадгалах'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Empty className="min-h-80 py-12">
                      <EmptyHeader>
                        <EmptyMedia variant="icon" className="bg-slate-100 text-slate-600">
                          {selectedVendor ? <FileText /> : <Building2 />}
                        </EmptyMedia>
                        <EmptyTitle className="text-base">
                          {selectedVendor ? 'Үнэлгээний шалгуур алга' : 'Нийлүүлэгч сонгоно уу'}
                        </EmptyTitle>
                        <EmptyDescription>
                          {selectedVendor
                            ? 'Энэ тендерт оноо өгөх шалгуур бүртгэгдээгүй байна.'
                            : 'Зүүн талын жагсаалтаас үнэлэх нийлүүлэгчээ сонгоно уу.'}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
