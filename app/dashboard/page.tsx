"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileText,
  PackageSearch,
  Send,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { useTenderCatalog } from "@/hooks/use-tenders"
import { fetchQuotes, fetchVendorTenders, type ApiQuote } from "@/lib/api"
import { getStoredUser } from "@/lib/auth"
import type { Tender } from "@/lib/tender-data"

type VendorSubmission = { quote: ApiQuote; tender: Tender }

const participationChartConfig = {
  proposals: {
    label: "Саналын тоо",
    color: "#f97316",
  },
} satisfies ChartConfig

function formatMoney(value: number | string | undefined) {
  return `${new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 0 }).format(Number(value ?? 0))} ₮`
}

function formatCompactMoney(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} тэрбум ₮`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} сая ₮`
  return formatMoney(value)
}

function parseApiDate(value?: string) {
  if (!value) return null

  const normalized = value.trim().replace(/\./g, "-").replace(" ", "T")
  const parsed = new Date(normalized)
  if (!Number.isNaN(parsed.getTime())) return parsed

  const parts = value.match(/^(\d{4})[.-](\d{1,2})[.-](\d{1,2})/)
  if (!parts) return null
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
}

function formatDate(value?: string) {
  const date = parseApiDate(value)
  if (!date) return value || "Огноо бүртгэгдээгүй"
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}.${month}.${day}`
}

function getParticipationStatus(status: Tender["status"]) {
  if (status === "awarded") return { label: "Шалгарсан", className: "bg-emerald-50 text-emerald-700" }
  if (status === "closed") return { label: "Хаагдсан", className: "bg-slate-100 text-slate-700" }
  return { label: "Хянагдаж буй", className: "bg-amber-50 text-amber-700" }
}

export default function DashboardPage() {
  const [submissions, setSubmissions] = useState<VendorSubmission[]>([])
  const [vendorTenders, setVendorTenders] = useState<Tender[]>([])
  const [vendorName, setVendorName] = useState("Нийлүүлэгч")
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState("")
  const {
    tenders: openTenders,
    loading: openTenderLoading,
    error: openTenderError,
  } = useTenderCatalog("open")

  useEffect(() => {
    let cancelled = false
    const user = getStoredUser()

    if (user?.vendorName) setVendorName(user.vendorName)
    if (!user?.vendorId) {
      setHistoryLoading(false)
      return
    }

    const loadVendorHistory = async () => {
      try {
        const rows = await fetchVendorTenders(user.vendorId!)
        const quoteGroups = await Promise.all(
          rows.map(async (tender) => {
            const quotes = await fetchQuotes(tender.invitationId, user.vendorId!)
            return quotes.map((quote) => ({ quote, tender }))
          }),
        )

        if (!cancelled) {
          setVendorTenders(rows)
          setSubmissions(quoteGroups.flat())
        }
      } catch (requestError) {
        if (!cancelled) {
          setHistoryError(
            requestError instanceof Error
              ? requestError.message
              : "Оролцооны түүхийг ачаалж чадсангүй.",
          )
        }
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    }

    void loadVendorHistory()
    return () => {
      cancelled = true
    }
  }, [])

  const recentSubmissions = useMemo(
    () =>
      [...submissions].sort((left, right) => {
        const leftTime = parseApiDate(left.quote.qoutedate)?.getTime() ?? 0
        const rightTime = parseApiDate(right.quote.qoutedate)?.getTime() ?? 0
        return rightTime - leftTime
      }),
    [submissions],
  )

  const participationChartData = useMemo(() => {
    const datedSubmissions = submissions
      .map((submission) => ({ submission, date: parseApiDate(submission.quote.qoutedate) }))
      .filter((item): item is { submission: VendorSubmission; date: Date } => item.date !== null)
    const latestDate = datedSubmissions.reduce<Date | null>(
      (latest, item) => (!latest || item.date > latest ? item.date : latest),
      null,
    )
    const anchor = latestDate ?? new Date()
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(anchor.getFullYear(), anchor.getMonth() - (5 - index), 1)
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        month: `${date.getMonth() + 1}-р сар`,
        proposals: 0,
      }
    })
    const monthMap = new Map(months.map((month) => [month.key, month]))

    for (const item of datedSubmissions) {
      const key = `${item.date.getFullYear()}-${item.date.getMonth()}`
      const month = monthMap.get(key)
      if (month) month.proposals += 1
    }

    return months
  }, [submissions])

  const activeParticipation = vendorTenders.filter((item) =>
    ["open", "closing-soon", "upcoming"].includes(item.status),
  ).length
  const closedParticipation = vendorTenders.filter((item) =>
    ["closed", "awarded"].includes(item.status),
  ).length
  const awarded = vendorTenders.filter((item) => item.status === "awarded").length
  const totalProposalAmount = submissions.reduce(
    (total, item) => total + (Number(item.quote.qouteamount) || 0),
    0,
  )
  const resultProgress = vendorTenders.length
    ? Math.round((closedParticipation / vendorTenders.length) * 100)
    : 0

  const journeySteps = [
    {
      label: "Нээлттэй боломж",
      detail: "Одоо санал авч буй",
      value: openTenders.length,
      icon: PackageSearch,
      tone: "bg-orange-50 text-orange-600",
    },
    {
      label: "Оролцсон тендер",
      detail: "Нийт оролцооны түүх",
      value: vendorTenders.length,
      icon: Send,
      tone: "bg-blue-50 text-blue-600",
    },
    {
      label: "Хянагдаж буй",
      detail: "Идэвхтэй оролцоо",
      value: activeParticipation,
      icon: Clock3,
      tone: "bg-amber-50 text-amber-600",
    },
    {
      label: "Хаагдсан",
      detail: `${awarded} тендерт шалгарсан`,
      value: closedParticipation,
      icon: CheckCircle2,
      tone: "bg-emerald-50 text-emerald-600",
    },
  ]

  return (
    <div className="min-h-full bg-slate-50/70 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="pl-11 text-xs font-semibold uppercase text-orange-600 sm:pl-0">
              НИЙЛҮҮЛЭГЧИЙН ПОРТАЛ
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">
              Хяналтын самбар
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:line-clamp-2 sm:text-base">
              {vendorName} компанийн тендерийн боломж, санал болон үр дүнгийн нэгдсэн тойм
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button asChild variant="outline" className="bg-white">
              <Link href="/dashboard/my-tenders">
                <FileCheck2 className="size-4" />
                Миний тендерүүд
              </Link>
            </Button>
            <Button asChild className="bg-orange-500 text-white hover:bg-orange-600">
              <Link href="/tenders/open">
                <PackageSearch className="size-4" />
                Боломж хайх
              </Link>
            </Button>
          </div>
        </header>

        {historyError && (
          <Alert variant="destructive" className="mt-6 bg-white">
            <AlertCircle />
            <AlertTitle>Оролцооны мэдээлэл шинэчлэгдсэнгүй</AlertTitle>
            <AlertDescription>{historyError}</AlertDescription>
          </Alert>
        )}

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Үндсэн үзүүлэлт">
          <Stat
            label="Нээлттэй боломж"
            value={openTenderLoading ? "—" : openTenders.length}
            detail="Санал хүлээн авч буй тендер"
            icon={PackageSearch}
            tone="bg-orange-50 text-orange-600"
          />
          <Stat
            label="Оролцсон тендер"
            value={historyLoading ? "—" : vendorTenders.length}
            detail="Бүртгэгдсэн нийт оролцоо"
            icon={FileText}
            tone="bg-blue-50 text-blue-600"
          />
          <Stat
            label="Илгээсэн санал"
            value={historyLoading ? "—" : submissions.length}
            detail="Багц тус бүрийн үнийн санал"
            icon={Send}
            tone="bg-violet-50 text-violet-600"
          />
          <Stat
            label="Нийт саналын дүн"
            value={historyLoading ? "—" : formatCompactMoney(totalProposalAmount)}
            detail="Илгээсэн саналуудын нийлбэр"
            icon={WalletCards}
            tone="bg-emerald-50 text-emerald-600"
            compact
          />
        </section>

        <section className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
          <Card className="min-w-0 rounded-lg border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
                  Саналын идэвх
                </CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Сүүлийн бүртгэлээс тооцсон 6 сарын саналын тоо
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 bg-white font-normal text-slate-600">
                <TrendingUp className="size-3.5 text-orange-500" />
                Нийт {submissions.length}
              </Badge>
            </CardHeader>
            <CardContent className="pt-4">
              {historyLoading ? (
                <Skeleton className="h-[260px] w-full rounded-md" />
              ) : (
                <ChartContainer
                  config={participationChartConfig}
                  className="h-[260px] w-full min-w-0 aspect-auto"
                >
                  <BarChart data={participationChartData} margin={{ left: -16, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={10} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                    <ChartTooltip
                      cursor={{ fill: "#f8fafc" }}
                      content={<ChartTooltipContent indicator="dot" />}
                    />
                    <Bar
                      dataKey="proposals"
                      fill="var(--color-proposals)"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={44}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
                Тендерийн явц
              </CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Оролцооны үе шатны бодит үзүүлэлт
              </p>
            </CardHeader>
            <CardContent>
              {historyLoading || openTenderLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-12 w-full rounded-md" />
                  ))}
                </div>
              ) : (
                <div className="space-y-0">
                  {journeySteps.map((step, index) => (
                    <div key={step.label}>
                      <div className="flex items-center gap-3">
                        <div className={`flex size-10 shrink-0 items-center justify-center rounded-md ${step.tone}`}>
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
                      {index < journeySteps.length - 1 && (
                        <div className="ml-[19px] h-5 w-px bg-slate-200" aria-hidden="true" />
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500">Хаагдсан оролцооны хувь</span>
                  <span className="font-semibold tabular-nums text-slate-800">{resultProgress}%</span>
                </div>
                <Progress value={resultProgress} className="h-1.5 bg-slate-100 [&>div]:bg-orange-500" />
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
          <Card className="min-w-0 rounded-lg border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
                  Сүүлийн саналууд
                </CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Багц тус бүрээр бүртгэгдсэн үнийн санал
                </p>
              </div>
              <Button asChild variant="ghost" size="sm" className="shrink-0">
                <Link href="/dashboard/my-tenders">
                  Бүгдийг харах
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <DashboardListSkeleton />
              ) : recentSubmissions.length ? (
                <div className="divide-y divide-slate-100 border-y border-slate-100">
                  {recentSubmissions.slice(0, 5).map(({ quote, tender }) => {
                    const status = getParticipationStatus(tender.status)
                    return (
                      <Link
                        key={quote.qouteid}
                        href={`/tenders/${tender.id}`}
                        className="grid min-w-0 gap-3 px-1 py-4 transition-colors hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3"
                      >
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <Badge className={`shrink-0 border-0 font-normal ${status.className}`}>
                              {status.label}
                            </Badge>
                            <span className="truncate text-xs text-slate-500">
                              {tender.tenderCode ?? tender.id}
                            </span>
                          </div>
                          <p className="mt-2 truncate text-sm font-medium text-slate-900">
                            {tender.title}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {quote.batchname || "Тендерийн нийт санал"} · {formatDate(quote.qoutedate)}
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-sm font-semibold tabular-nums text-slate-900">
                            {formatMoney(quote.qouteamount)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Хүргэлт {quote.deliveryday ?? 0} хоног
                          </p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <Empty className="min-h-52 border border-slate-200 py-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon" className="bg-orange-50 text-orange-600">
                      <FileText />
                    </EmptyMedia>
                    <EmptyTitle className="text-base">Үнийн санал бүртгэгдээгүй</EmptyTitle>
                    <EmptyDescription>
                      Тендерт оролцож санал илгээсний дараа энд түүх нь харагдана.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 rounded-lg border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
                    Нээлттэй боломж
                  </CardTitle>
                  <p className="mt-1 text-sm text-slate-500">
                    Санал авах хугацаа дуусаагүй тендерүүд
                  </p>
                </div>
                {!openTenderLoading && (
                  <Badge variant="secondary" className="tabular-nums">
                    {openTenders.length}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {openTenderLoading ? (
                <DashboardListSkeleton />
              ) : openTenders.length ? (
                <div className="divide-y divide-slate-100 border-y border-slate-100">
                  {openTenders.slice(0, 4).map((tender) => (
                    <Link
                      key={tender.id}
                      href={`/tenders/${tender.id}`}
                      className="flex min-w-0 items-start gap-3 px-1 py-4 transition-colors hover:bg-slate-50 sm:px-3"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-orange-50">
                        <CalendarDays className="size-4 text-orange-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium leading-5 text-slate-900">
                          {tender.title}
                        </p>
                        <div className="mt-2 flex min-w-0 items-center justify-between gap-3">
                          <span className="truncate text-xs text-slate-500">
                            {tender.tenderCode ?? tender.id}
                          </span>
                          <span className="shrink-0 text-xs font-medium text-orange-700">
                            {tender.deadline}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty className="min-h-52 border border-slate-200 py-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon" className="bg-slate-100 text-slate-600">
                      <PackageSearch />
                    </EmptyMedia>
                    <EmptyTitle className="text-base">Нээлттэй тендер алга</EmptyTitle>
                    <EmptyDescription>
                      {openTenderError || "Одоогоор санал авч буй тендер бүртгэгдээгүй байна."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              <Button asChild className="mt-4 w-full bg-orange-500 text-white hover:bg-orange-600">
                <Link href="/tenders/open">
                  Нээлттэй тендер үзэх
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}

function DashboardListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-[76px] w-full rounded-md" />
      ))}
    </div>
  )
}

function Stat({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  compact = false,
}: {
  label: string
  value: number | string
  detail: string
  icon: LucideIcon
  tone: string
  compact?: boolean
}) {
  return (
    <Card className="gap-0 rounded-lg border-slate-200 py-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-slate-500">{label}</p>
            <p
              className={`mt-2 truncate font-semibold tabular-nums text-slate-950 ${
                compact ? "text-lg xl:text-xl" : "text-3xl"
              }`}
              title={String(value)}
            >
              {value}
            </p>
          </div>
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-md ${tone}`}>
            <Icon className="size-5" />
          </div>
        </div>
        <p className="mt-3 truncate text-xs text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  )
}
