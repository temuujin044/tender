'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Search,
  Users,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchEvaluationTenders } from '@/lib/api';
import type { Tender } from '@/lib/tender-data';

export default function EvaluationsPage() {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await fetchEvaluationTenders();
        if (!cancelled) setTenders(rows);
      } catch (requestError) {
        if (!cancelled)
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Үнэлгээний тендерүүдийг ачаалж чадсангүй.'
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tenders;
    return tenders.filter((tender) =>
      `${tender.title} ${tender.tenderCode} ${tender.invitationCode} ${tender.department}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [query, tenders]);

  const awaiting = tenders.filter((tender) => tender.status === 'closed').length;
  const completed = tenders.filter((tender) => tender.status === 'awarded').length;
  const departments = new Set(tenders.map((tender) => tender.department).filter(Boolean)).size;

  return (
    <div className="min-h-full bg-slate-50 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="pl-11 sm:pl-0">
          <p className="text-xs font-semibold uppercase text-orange-600">ТЕНДЕРИЙН АЖИЛТАН</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Үнэлгээ</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">
            Хаагдсан тендерүүдийн нийлүүлэгчийн санал, шалгуур болон онооны явцыг удирдана.
          </p>
        </header>

        {error && (
          <Alert variant="destructive" className="mt-6 bg-white">
            <FileSearch />
            <AlertTitle>Мэдээлэл ачаалсангүй</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section
          className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Үнэлгээний үзүүлэлт"
        >
          <Metric
            label="Нийт тендер"
            value={tenders.length}
            icon={ClipboardCheck}
            tone="bg-blue-50 text-blue-600"
            loading={loading}
          />
          <Metric
            label="Үнэлгээ хүлээж буй"
            value={awaiting}
            icon={FileSearch}
            tone="bg-amber-50 text-amber-600"
            loading={loading}
          />
          <Metric
            label="Үр дүн гарсан"
            value={completed}
            icon={CheckCircle2}
            tone="bg-emerald-50 text-emerald-600"
            loading={loading}
          />
          <Metric
            label="Хариуцсан нэгж"
            value={departments}
            icon={Building2}
            tone="bg-violet-50 text-violet-600"
            loading={loading}
          />
        </section>

        <Card className="mt-6 rounded-lg border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg">Үнэлэх тендерүүд</CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Санал хүлээн авах хугацаа дууссан урилгын жагсаалт
                </p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Нэр, код, нэгжээр хайх"
                  className="bg-white pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-md" />
                ))}
              </div>
            ) : filtered.length ? (
              <div className="divide-y divide-slate-100">
                {filtered.slice(0, 60).map((tender) => (
                  <Link
                    key={tender.invitationId}
                    href={`/employee/evaluations/${tender.invitationId}`}
                    className="group grid min-w-0 gap-4 p-5 transition-colors hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_190px_44px] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge
                          className={
                            tender.status === 'awarded'
                              ? 'border-0 bg-emerald-50 text-emerald-700'
                              : 'border-0 bg-amber-50 text-amber-700'
                          }
                        >
                          {tender.status === 'awarded' ? 'Үр дүн гарсан' : 'Үнэлгээ хүлээж буй'}
                        </Badge>
                        <span className="truncate text-xs text-slate-500">
                          {tender.invitationCode}
                        </span>
                      </div>
                      <h2
                        className="mt-2 truncate text-sm font-semibold text-slate-900"
                        title={tender.title}
                      >
                        {tender.title}
                      </h2>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {tender.department} · {tender.tenderCode}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Санал нээсэн</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{tender.openDate}</p>
                    </div>
                    <span className="flex size-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 group-hover:border-orange-200 group-hover:text-orange-600">
                      <ArrowRight className="size-4" />
                    </span>
                  </Link>
                ))}
                {filtered.length > 60 && (
                  <p className="border-t border-slate-100 px-6 py-4 text-center text-xs text-slate-500">
                    Эхний 60 үр дүнг харуулж байна. Хайлтаа нарийвчилна уу.
                  </p>
                )}
              </div>
            ) : (
              <Empty className="min-h-64 py-10">
                <EmptyHeader>
                  <EmptyMedia variant="icon" className="bg-slate-100 text-slate-600">
                    <FileSearch />
                  </EmptyMedia>
                  <EmptyTitle className="text-base">Тохирох тендер олдсонгүй</EmptyTitle>
                  <EmptyDescription>Хайлтын утгаа өөрчлөөд дахин шалгана уу.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
  loading,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  tone: string;
  loading: boolean;
}) {
  return (
    <Card className="gap-0 rounded-lg border-slate-200 py-0 shadow-sm">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-16" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
          )}
        </div>
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-md ${tone}`}>
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}
