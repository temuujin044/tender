"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Building2, Calendar, CheckCircle2, Clock3, ExternalLink, FileText, Search, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchQuotes, fetchVendorTenders } from "@/lib/api"
import { getStoredUser } from "@/lib/auth"

type SubmissionStatus = "submitted" | "under-review" | "awarded" | "not-awarded"
type VendorSubmission = {
  id: number
  tenderId: string
  tenderCode: string
  title: string
  batchName: string
  status: SubmissionStatus
  quoteAmount: number
  deliveryDays: number
  submittedAt: string
}

function formatMoney(value: number) { return `${new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 0 }).format(value)} ₮` }

const statusConfig: Record<SubmissionStatus, { label: string; className: string; icon: typeof FileText }> = {
  submitted: { label: "Илгээсэн", className: "bg-blue-100 text-blue-700", icon: FileText },
  "under-review": { label: "Хянагдаж байна", className: "bg-amber-100 text-amber-700", icon: Clock3 },
  awarded: { label: "Шалгарсан", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  "not-awarded": { label: "Шалгараагүй", className: "bg-slate-100 text-slate-600", icon: XCircle },
}

export default function MyTendersPage() {
  const [submissions, setSubmissions] = useState<VendorSubmission[]>([])
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [tab, setTab] = useState("all")

  useEffect(() => {
    const user = getStoredUser()
    if (!user?.vendorId) return
    void fetchVendorTenders(user.vendorId).then(async (tenders) => {
      const groups = await Promise.all(tenders.map(async (tender) => (await fetchQuotes(tender.invitationId, user.vendorId!)).map((quote) => ({
        id: quote.qouteid,
        tenderId: tender.id,
        tenderCode: tender.tenderCode ?? tender.id,
        title: tender.title,
        batchName: quote.batchname || "Тендерийн нийт санал",
        status: tender.status === "awarded" ? "awarded" as const : tender.status === "closed" ? "under-review" as const : "submitted" as const,
        quoteAmount: Number(quote.qouteamount ?? 0),
        deliveryDays: Number(quote.deliveryday ?? 0),
        submittedAt: quote.qoutedate ?? "",
      }))))
      setSubmissions(groups.flat())
    })
  }, [])

  const filtered = useMemo(() => submissions.filter((submission) => {
    const matchesSearch = `${submission.tenderCode} ${submission.title} ${submission.batchName}`.toLowerCase().includes(search.toLowerCase())
    const matchesTab = tab === "all" || (tab === "active" ? ["submitted", "under-review"].includes(submission.status) : ["awarded", "not-awarded"].includes(submission.status))
    return matchesSearch && matchesTab && (status === "all" || submission.status === status)
  }), [search, status, submissions, tab])

  const activeCount = submissions.filter((item) => ["submitted", "under-review"].includes(item.status)).length
  const completed = submissions.filter((item) => ["awarded", "not-awarded"].includes(item.status))
  const awardedCount = submissions.filter((item) => item.status === "awarded").length
  const successRate = completed.length ? Math.round((awardedCount / completed.length) * 100) : 0

  return (
    <div className="bg-slate-50/70 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
      <div className="mb-8"><h1 className="text-2xl font-bold text-slate-900">Миний тендерүүд</h1><p className="mt-1 text-slate-500">Оролцсон урилга болон багц тус бүрийн үнийн саналын явцыг хянана.</p></div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Нийт санал" value={submissions.length} icon={FileText} />
        <Stat label="Идэвхтэй" value={activeCount} icon={Clock3} tone="text-blue-600 bg-blue-50" />
        <Stat label="Шалгарсан" value={awardedCount} icon={CheckCircle2} tone="text-emerald-600 bg-emerald-50" />
        <Stat label="Амжилтын хувь" value={`${successRate}%`} icon={CheckCircle2} tone="text-orange-600 bg-orange-50" />
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="all">Бүгд</TabsTrigger><TabsTrigger value="active">Идэвхтэй</TabsTrigger><TabsTrigger value="completed">Дууссан</TabsTrigger></TabsList></Tabs>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Код, нэр, багцаар хайх" className="pl-9" /></div>
              <Select value={status} onValueChange={setStatus}><SelectTrigger className="sm:w-44"><SelectValue placeholder="Төлөв" /></SelectTrigger><SelectContent><SelectItem value="all">Бүх төлөв</SelectItem><SelectItem value="submitted">Илгээсэн</SelectItem><SelectItem value="under-review">Хянагдаж байна</SelectItem><SelectItem value="awarded">Шалгарсан</SelectItem><SelectItem value="not-awarded">Шалгараагүй</SelectItem></SelectContent></Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length ? <div className="divide-y divide-slate-100">{filtered.map((submission) => {
            const config = statusConfig[submission.status]
            const Icon = config.icon
            return <div key={submission.id} className="flex flex-col gap-5 p-6 transition-colors hover:bg-slate-50 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge className={config.className}><Icon className="mr-1 h-3 w-3" />{config.label}</Badge><span className="text-sm font-medium text-slate-500">{submission.tenderCode}</span><span className="text-xs text-slate-400">Q-{submission.id}</span></div><h2 className="mt-2 font-semibold text-slate-900">{submission.title}</h2><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500"><span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{submission.batchName}</span><span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Саналын огноо: {submission.submittedAt || "Тодорхойгүй"}</span></div></div>
              <div className="flex items-center justify-between gap-5 lg:justify-end"><div className="lg:text-right"><p className="text-xs text-slate-500">Үнийн санал</p><p className="mt-1 text-lg font-bold text-slate-900">{formatMoney(submission.quoteAmount)}</p><p className="text-xs text-slate-500">Хүргэлт: {submission.deliveryDays} хоног</p></div><Link href={`/tenders/${submission.tenderId}`}><Button variant="outline" size="sm">Дэлгэрэнгүй<ExternalLink className="ml-2 h-3.5 w-3.5" /></Button></Link></div>
            </div>
          })}</div> : <div className="p-16 text-center"><FileText className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-medium text-slate-700">Тохирох санал олдсонгүй</p><p className="mt-1 text-sm text-slate-500">Шүүлтүүрээ өөрчлөх эсвэл шинэ тендерт оролцоно уу.</p></div>}
        </CardContent>
      </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, icon: Icon, tone = "text-slate-600 bg-slate-100" }: { label: string; value: string | number; icon: typeof FileText; tone?: string }) {
  return <Card className="border-slate-200"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p></div><div className={`rounded-xl p-3 ${tone}`}><Icon className="h-5 w-5" /></div></CardContent></Card>
}
