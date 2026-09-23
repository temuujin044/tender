'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileEdit,
  FilePlus2,
  Files,
  Send,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchEmployeeTenders, fetchEvaluationTenders } from '@/lib/api';
import { formatEmployeeMoney, type EmployeeTender } from '@/lib/employee-tender';

const statusConfig = {
  draft: { label: 'Ноорог', className: 'bg-slate-100 text-slate-700' },
  ready: { label: 'Бэлэн', className: 'bg-blue-50 text-blue-700' },
  published: { label: 'Нийтэлсэн', className: 'bg-orange-50 text-orange-700' },
  closed: { label: 'Хаагдсан', className: 'bg-emerald-50 text-emerald-700' },
} satisfies Record<EmployeeTender['status'], { label: string; className: string }>;

const activityChartConfig = {
  preparing: { label: 'Бэлтгэл', color: '#3b82f6' },
  active: { label: 'Нийтэлсэн', color: '#f97316' },
  closed: { label: 'Хаагдсан', color: '#10b981' },
} satisfies ChartConfig;

function parseDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value.trim().replace(/\./g, '-').replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value?: string) {
  const date = parseDate(value);
  if (!date) return 'Огноо бүртгэгдээгүй';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}.${month}.${day}`;
}

export default function EmployeeDashboard() {
  const [tenders, setTenders] = useState<EmployeeTender[]>([]);
  const [evaluationCount, setEvaluationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [rows, evaluationTenders] = await Promise.all([
          fetchEmployeeTenders(),
          fetchEvaluationTenders(),
        ]);
        if (!cancelled) {
          setTenders(rows);
          setEvaluationCount(evaluationTenders.length);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Тендерийн хяналтын мэдээллийг ачаалж чадсангүй.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(
    () => ({
      draft: tenders.filter((item) => item.status === 'draft').length,
      ready: tenders.filter((item) => item.status === 'ready').length,
      published: tenders.filter((item) => item.status === 'published').length,
      closed: tenders.filter((item) => item.status === 'closed').length,
    }),
    [tenders]
  );

  const departmentCount = useMemo(
    () => new Set(tenders.map((item) => item.department.trim()).filter(Boolean)).size,
    [tenders]
  );

  const recentTenders = useMemo(
    () =>
      [...tenders].sort((left, right) => {
        const leftTime = parseDate(left.updatedAt || left.publishDate)?.getTime() ?? 0;
        const rightTime = parseDate(right.updatedAt || right.publishDate)?.getTime() ?? 0;
        return rightTime - leftTime;
      }),
    [tenders]
  );

  const activityChartData = useMemo(() => {
    const datedTenders = tenders
      .map((tender) => ({ tender, date: parseDate(tender.publishDate || tender.updatedAt) }))
      .filter((item): item is { tender: EmployeeTender; date: Date } => item.date !== null);
    const latestDate = datedTenders.reduce<Date | null>(
      (latest, item) => (!latest || item.date > latest ? item.date : latest),
      null
    );
    const anchor = latestDate ?? new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(anchor.getFullYear(), anchor.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        month: `${String(date.getFullYear()).slice(-2)}.${String(date.getMonth() + 1).padStart(2, '0')}`,
        preparing: 0,
        active: 0,
        closed: 0,
      };
    });
    const monthMap = new Map(months.map((month) => [month.key, month]));

    for (const { tender, date } of datedTenders) {
      const month = monthMap.get(`${date.getFullYear()}-${date.getMonth()}`);
      if (!month) continue;
      if (tender.status === 'closed') month.closed += 1;
      else if (tender.status === 'published') month.active += 1;
      else month.preparing += 1;
    }

    return months;
  }, [tenders]);

  const processedPercent = tenders.length
    ? Math.round(((counts.published + counts.closed) / tenders.length) * 100)
    : 0;

  const workflow = [
    {
      label: 'Ноорог',
      detail: 'Мэдээлэл боловсруулж буй',
      value: counts.draft,
      icon: FileEdit,
      tone: 'bg-slate-100 text-slate-600',
    },
    {
      label: 'Нийтлэхэд бэлэн',
      detail: 'Хяналт хүлээж буй',
      value: counts.ready,
      icon: CheckCircle2,
      tone: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Нийтэлсэн',
      detail: 'Санал хүлээн авч буй',
      value: counts.published,
      icon: Send,
      tone: 'bg-orange-50 text-orange-600',
    },
    {
      label: 'Хаагдсан',
      detail: 'Үнэлгээ болон үр дүн',
      value: counts.closed,
      icon: ClipboardCheck,
      tone: 'bg-emerald-50 text-emerald-600',
    },
  ];

  const workQueue = [
    {
      title: 'Ноорог тендерүүд',
      detail: 'Мэдээллийг гүйцээж бэлтгэх',
      value: counts.draft,
      href: '/employee/tenders',
      icon: FileEdit,
      tone: 'bg-slate-100 text-slate-600',
    },
    {
      title: 'Идэвхтэй тендерүүд',
      detail: 'Санал хүлээн авах явцыг хянах',
      value: counts.published,
      href: '/employee/tenders',
      icon: Clock3,
      tone: 'bg-orange-50 text-orange-600',
    },
    {
      title: 'Үнэлгээ хийх',
      detail: 'Нийлүүлэгчийн санал, шалгуур',
      value: evaluationCount,
      href: '/employee/evaluations',
      icon: ClipboardCheck,
      tone: 'bg-emerald-50 text-emerald-600',
    },
  ];

  return (
    <div className="min-h-full bg-slate-50/70 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="pl-11 text-xs font-semibold uppercase text-orange-600 sm:pl-0">
              ТЕНДЕРИЙН АЖИЛТАН
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Хяналтын самбар</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">
              Тендерийн бэлтгэл, нийтлэл, үнэлгээ болон үр дүнгийн нэгдсэн тойм
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="outline" className="bg-white">
              <Link href="/employee/tenders">
                <Files className="size-4" />
                Бүх тендер
              </Link>
            </Button>
            <Button asChild className="bg-orange-500 text-white hover:bg-orange-600">
              <Link href="/employee/tenders/new">
                <FilePlus2 className="size-4" />
                Шинэ тендер
              </Link>
            </Button>
          </div>
        </header>

        {error && (
          <Alert variant="destructive" className="mt-6 bg-white">
            <AlertCircle />
            <AlertTitle>Хяналтын мэдээлэл шинэчлэгдсэнгүй</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section
          className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Үндсэн үзүүлэлт"
        >
          <Stat
            label="Нийт тендер"
            value={tenders.length}
            detail="Бүртгэлтэй урилга"
            icon={Files}
            tone="bg-slate-100 text-slate-700"
            loading={loading}
          />
          <Stat
            label="Идэвхтэй"
            value={counts.published}
            detail="Санал хүлээн авч буй"
            icon={Send}
            tone="bg-orange-50 text-orange-600"
            loading={loading}
          />
          <Stat
            label="Үнэлгээ, үр дүн"
            value={evaluationCount}
            detail="Үнэлгээний жагсаалтад байгаа"
            icon={ClipboardCheck}
            tone="bg-emerald-50 text-emerald-600"
            loading={loading}
          />
          <Stat
            label="Хариуцсан нэгж"
            value={departmentCount}
            detail="Тендер бүртгэсэн газар, нэгж"
            icon={UsersRound}
            tone="bg-blue-50 text-blue-600"
            loading={loading}
          />
        </section>

        <section className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
          <Card className="min-w-0 rounded-lg border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
                  Тендерийн идэвх
                </CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Нийтэлсэн сараар бүлэглэсэн сүүлийн 6 сарын төлөв
                </p>
              </div>
              {!loading && (
                <Badge variant="outline" className="shrink-0 bg-white font-normal text-slate-600">
                  <TrendingUp className="size-3.5 text-orange-500" />
                  Нийт {tenders.length}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="pt-4">
              {loading ? (
                <Skeleton className="h-[270px] w-full rounded-md" />
              ) : (
                <ChartContainer
                  config={activityChartConfig}
                  className="h-[270px] w-full min-w-0 aspect-auto"
                >
                  <BarChart data={activityChartData} margin={{ left: -16, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={10} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip
                      cursor={{ fill: '#f8fafc' }}
                      content={<ChartTooltipContent indicator="dot" />}
                    />
                    <Bar
                      dataKey="preparing"
                      fill="var(--color-preparing)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                    <Bar
                      dataKey="active"
                      fill="var(--color-active)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                    <Bar
                      dataKey="closed"
                      fill="var(--color-closed)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                  </BarChart>
                </ChartContainer>
              )}
              <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-slate-500">
                {Object.entries(activityChartConfig).map(([key, item]) => (
                  <span key={key} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm" style={{ backgroundColor: item.color }} />
                    {item.label}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
                Тендерийн урсгал
              </CardTitle>
              <p className="mt-1 text-sm text-slate-500">Бэлтгэлээс үр дүн хүртэлх бодит төлөв</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-12 w-full rounded-md" />
                  ))}
                </div>
              ) : (
                <div>
                  {workflow.map((step, index) => (
                    <div key={step.label}>
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex size-10 shrink-0 items-center justify-center rounded-md ${step.tone}`}
                        >
                          <step.icon className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{step.label}</p>
                          <p className="truncate text-xs text-slate-500">{step.detail}</p>
                        </div>
                        <span className="text-xl font-semibold tabular-nums text-slate-950">
                          {step.value}
                        </span>
                      </div>
                      {index < workflow.length - 1 && (
                        <div className="ml-[19px] h-5 w-px bg-slate-200" aria-hidden="true" />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500">Нийтэлсэн болон хаагдсан</span>
                  <span className="font-semibold tabular-nums text-slate-800">
                    {processedPercent}%
                  </span>
                </div>
                <Progress
                  value={processedPercent}
                  className="h-1.5 bg-slate-100 [&>div]:bg-orange-500"
                />
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
          <Card className="min-w-0 rounded-lg border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
                  Сүүлийн тендерүүд
                </CardTitle>
                <p className="mt-1 text-sm text-slate-500">Шинэчлэгдсэн дарааллаар</p>
              </div>
              <Button asChild variant="ghost" size="sm" className="shrink-0">
                <Link href="/employee/tenders">
                  Бүгдийг харах
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <DashboardListSkeleton />
              ) : recentTenders.length ? (
                <div className="divide-y divide-slate-100 border-y border-slate-100">
                  {recentTenders.slice(0, 6).map((tender) => {
                    const status = statusConfig[tender.status];
                    return (
                      <Link
                        key={tender.id}
                        href={`/employee/tenders/${tender.invitationId}`}
                        className="grid min-w-0 gap-3 px-1 py-4 transition-colors hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3"
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <Badge className={`shrink-0 border-0 font-normal ${status.className}`}>
                              {status.label}
                            </Badge>
                            <span className="truncate text-xs text-slate-500">
                              {tender.invitationCode || tender.tenderCode}
                            </span>
                          </div>
                          <p
                            className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-slate-900 sm:line-clamp-1"
                            title={tender.name}
                          >
                            {tender.name || 'Нэр өгөөгүй тендер'}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {tender.department || 'Нэгж сонгоогүй'}
                          </p>
                        </div>
                        <div className="min-w-0 text-left sm:max-w-48 sm:text-right">
                          <p className="truncate text-sm font-medium tabular-nums text-slate-800">
                            {formatEmployeeMoney(tender.budget)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDate(tender.updatedAt || tender.publishDate)}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Empty className="min-h-52 border border-slate-200 py-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon" className="bg-orange-50 text-orange-600">
                      <Files />
                    </EmptyMedia>
                    <EmptyTitle className="text-base">Тендер бүртгэгдээгүй</EmptyTitle>
                    <EmptyDescription>
                      Шинэ тендер үүсгэсний дараа энд хяналтын мэдээлэл харагдана.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 rounded-lg border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
                Ажлын дараалал
              </CardTitle>
              <p className="mt-1 text-sm text-slate-500">Төлөвт тулгуурласан шуурхай хандалт</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <DashboardListSkeleton />
              ) : (
                <div className="divide-y divide-slate-100 border-y border-slate-100">
                  {workQueue.map((item) => (
                    <Link
                      key={item.title}
                      href={item.href}
                      className="flex min-w-0 items-center gap-3 px-1 py-4 transition-colors hover:bg-slate-50 sm:px-3"
                    >
                      <span
                        className={`flex size-10 shrink-0 items-center justify-center rounded-md ${item.tone}`}
                      >
                        <item.icon className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900">
                          {item.title}
                        </span>
                        <span className="mt-1 block truncate text-xs text-slate-500">
                          {item.detail}
                        </span>
                      </span>
                      <span className="text-xl font-semibold tabular-nums text-slate-950">
                        {item.value}
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-slate-400" />
                    </Link>
                  ))}
                </div>
              )}
              <Button asChild className="mt-4 w-full bg-orange-500 text-white hover:bg-orange-600">
                <Link href="/employee/tenders/new">
                  Шинэ тендер үүсгэх
                  <FilePlus2 className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function DashboardListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-[76px] w-full rounded-md" />
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  loading,
}: {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  tone: string;
  loading: boolean;
}) {
  return (
    <Card className="gap-0 rounded-lg border-slate-200 py-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-slate-500">{label}</p>
            {loading ? (
              <Skeleton className="mt-2 h-9 w-16" />
            ) : (
              <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-950">{value}</p>
            )}
          </div>
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-md ${tone}`}>
            <Icon className="size-5" />
          </div>
        </div>
        <p className="mt-3 truncate text-xs text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}
