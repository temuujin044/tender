'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileSearch,
  Search,
  Trophy,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchQuotes, fetchVendorTenders } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

type SubmissionStatus = 'submitted' | 'under-review' | 'awarded' | 'not-awarded';
type VendorSubmission = {
  id: number;
  tenderId: string;
  tenderCode: string;
  title: string;
  batchName: string;
  status: SubmissionStatus;
  quoteAmount: number;
  deliveryDays: number;
  submittedAt: string;
};
function formatMoney(value: number) {
  return `${new Intl.NumberFormat('mn-MN', { maximumFractionDigits: 0 }).format(value)} ₮`;
}

const resultConfig: Record<
  SubmissionStatus,
  {
    label: string;
    description: string;
    className: string;
    icon: typeof Clock3;
  }
> = {
  submitted: {
    label: 'Санал хүлээн авсан',
    description: 'Үнэлгээ эхлэхийг хүлээж байна',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
    icon: Clock3,
  },
  'under-review': {
    label: 'Хянагдаж байна',
    description: 'Захиалагч саналд үнэлгээ хийж байна',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: FileSearch,
  },
  awarded: {
    label: 'Шалгарсан',
    description: 'Таны санал шалгарсан байна',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: Trophy,
  },
  'not-awarded': {
    label: 'Шалгараагүй',
    description: 'Энэ удаагийн сонгон шалгаруулалт дууссан',
    className: 'border-slate-200 bg-slate-100 text-slate-600',
    icon: XCircle,
  },
};

export function ParticipationResults() {
  const [submissions, setSubmissions] = useState<VendorSubmission[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const user = getStoredUser();
    if (!user?.vendorId) return;
    void fetchVendorTenders(user.vendorId).then(async (tenders) => {
      const groups = await Promise.all(
        tenders.map(async (tender) =>
          (await fetchQuotes(tender.invitationId, user.vendorId!)).map((quote) => ({
            id: quote.qouteid,
            tenderId: tender.id,
            tenderCode: tender.tenderCode ?? tender.id,
            title: tender.title,
            batchName: quote.batchname || 'Тендерийн нийт санал',
            status:
              tender.status === 'awarded'
                ? ('awarded' as const)
                : tender.status === 'closed'
                  ? ('under-review' as const)
                  : ('submitted' as const),
            quoteAmount: Number(quote.qouteamount ?? 0),
            deliveryDays: Number(quote.deliveryday ?? 0),
            submittedAt: quote.qoutedate ?? '',
          }))
        )
      );
      setSubmissions(groups.flat());
    });
  }, []);

  const filtered = useMemo(
    () =>
      submissions.filter((submission) => {
        const matchesQuery =
          `${submission.tenderCode} ${submission.id} ${submission.batchName} ${submission.title}`
            .toLowerCase()
            .includes(query.trim().toLowerCase());
        const matchesFilter =
          filter === 'all' ||
          (filter === 'pending' && ['submitted', 'under-review'].includes(submission.status)) ||
          submission.status === filter;
        return matchesQuery && matchesFilter;
      }),
    [filter, query, submissions]
  );

  const pendingCount = submissions.filter((item) =>
    ['submitted', 'under-review'].includes(item.status)
  ).length;
  const awardedCount = submissions.filter((item) => item.status === 'awarded').length;
  const completedCount = submissions.filter((item) =>
    ['awarded', 'not-awarded'].includes(item.status)
  ).length;

  return (
    <div className="space-y-7">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-orange-100 bg-orange-50/70 px-6 py-8 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-orange-600">
              Нийлүүлэгчийн санал
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-normal text-slate-900 sm:text-3xl">
              Оролцсон тендер / Үр дүн
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Илгээсэн үнийн саналын үнэлгээний явц болон эцсийн үр дүнг нэг дороос хянана.
            </p>
          </div>
        </div>
        <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Summary
            label="Нийт оролцсон"
            value={submissions.length}
            icon={Building2}
            tone="bg-orange-50 text-orange-600"
          />
          <Summary
            label="Үр дүн хүлээгдэж буй"
            value={pendingCount}
            icon={Clock3}
            tone="bg-amber-50 text-amber-600"
          />
          <Summary
            label="Шалгарсан"
            value={awardedCount}
            detail={`${completedCount} дууссан саналаас`}
            icon={CheckCircle2}
            tone="bg-emerald-50 text-emerald-600"
          />
        </div>
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardContent className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="all">Бүгд</TabsTrigger>
                <TabsTrigger value="pending">Хянагдаж буй</TabsTrigger>
                <TabsTrigger value="awarded">Шалгарсан</TabsTrigger>
                <TabsTrigger value="not-awarded">Шалгараагүй</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full xl:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Тендер, санал, багцын кодоор хайх"
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>

        <CardContent className="p-0">
          {filtered.length ? (
            <div className="divide-y divide-slate-100">
              {filtered.map((submission) => {
                const config = resultConfig[submission.status];
                const ResultIcon = config.icon;

                return (
                  <article
                    key={submission.id}
                    className="p-5 transition-colors hover:bg-slate-50/80 sm:p-6"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={config.className}>
                            <ResultIcon className="mr-1.5 h-3.5 w-3.5" />
                            {config.label}
                          </Badge>
                          <span className="text-xs font-medium text-slate-500">
                            {submission.tenderCode}
                          </span>
                          <span className="text-xs text-slate-400">Q-{submission.id}</span>
                        </div>
                        <h2 className="mt-3 text-base font-semibold text-slate-900 sm:text-lg">
                          {submission.title}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">{config.description}</p>
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="h-4 w-4" />
                            {submission.batchName}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <CalendarDays className="h-4 w-4" />
                            {submission.submittedAt || 'Тодорхойгүй'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-5 border-t border-slate-100 pt-4 lg:min-w-72 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                        <div>
                          <p className="text-xs text-slate-500">Илгээсэн үнийн санал</p>
                          <p className="mt-1 text-lg font-bold text-slate-900">
                            {formatMoney(submission.quoteAmount)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Хүргэлт: {submission.deliveryDays} хоног
                          </p>
                        </div>
                        <Link href={`/tenders/${submission.tenderId}`}>
                          <Button variant="outline" size="sm" className="shrink-0">
                            Харах
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <FileSearch className="h-6 w-6" />
              </div>
              <p className="mt-4 font-semibold text-slate-800">Тохирох оролцоо олдсонгүй</p>
              <p className="mt-1 text-sm text-slate-500">
                Хайлт эсвэл үр дүнгийн шүүлтүүрээ өөрчилнө үү.
              </p>
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Шүүлтүүр цэвэрлэх
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  detail?: string;
  icon: typeof Building2;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {detail && <p className="text-xs text-slate-400">{detail}</p>}
        </div>
      </div>
    </div>
  );
}
