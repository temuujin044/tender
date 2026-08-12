"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, FileText, MessageSquare, PackageSearch } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DUMMY_STORE_EVENT, formatMoney, getDummySubmissions, type DummySubmission } from "@/lib/dummy-tender-store"
import { getTenderById, tenders } from "@/lib/tender-data"

export default function DashboardPage() {
  const [submissions, setSubmissions] = useState<DummySubmission[]>([])

  useEffect(() => {
    const sync = () => setSubmissions(getDummySubmissions())
    sync()
    window.addEventListener(DUMMY_STORE_EVENT, sync)
    return () => window.removeEventListener(DUMMY_STORE_EVENT, sync)
  }, [])

  const active = submissions.filter((item) => ["submitted", "under-review"].includes(item.status)).length
  const awarded = submissions.filter((item) => item.status === "awarded").length
  const openTenders = tenders.filter((item) => ["open", "closing-soon"].includes(item.status))

  return (
    <div className="min-h-full bg-slate-50/70 p-6 lg:p-8">
      <div className="mb-8"><p className="text-sm font-medium text-orange-600">НИЙЛҮҮЛЭГЧИЙН ПОРТАЛ</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Хяналтын самбар</h1><p className="mt-2 text-slate-500">Тендерийн боломж, илгээсэн санал болон үнэлгээний явцыг нэг дороос хянана.</p></div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Боломжит тендер" value={openTenders.length} detail="Санал авах хугацаа нээлттэй" icon={PackageSearch} tone="bg-orange-50 text-orange-600" />
        <Stat label="Идэвхтэй санал" value={active} detail="Илгээсэн болон хянагдаж буй" icon={FileText} tone="bg-blue-50 text-blue-600" />
        <Stat label="Шалгарсан" value={awarded} detail="Эцсийн үр дүн" icon={CheckCircle2} tone="bg-emerald-50 text-emerald-600" />
        <Stat label="Шинэ тодруулга" value={1} detail="Уншаагүй хариулт" icon={MessageSquare} tone="bg-violet-50 text-violet-600" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <Card className="border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle className="text-lg">Сүүлийн саналууд</CardTitle><p className="mt-1 text-sm text-slate-500">Багц тус бүрээр бүртгэгдсэн үнийн санал</p></div><Link href="/dashboard/my-tenders"><Button variant="ghost" size="sm">Бүгдийг харах<ArrowRight className="ml-2 h-4 w-4" /></Button></Link></CardHeader><CardContent className="space-y-3">
          {submissions.slice(0, 4).map((submission) => {
            const tender = getTenderById(submission.tenderId)
            return <Link key={submission.id} href={`/tenders/${submission.tenderId}`} className="block rounded-xl border border-slate-200 p-4 transition-colors hover:border-orange-200 hover:bg-orange-50/30"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><Badge variant="secondary">{submission.status === "awarded" ? "Шалгарсан" : submission.status === "under-review" ? "Хянагдаж байна" : "Илгээсэн"}</Badge><span className="text-xs text-slate-500">{submission.tenderId}</span></div><p className="mt-2 truncate font-medium text-slate-900">{tender?.title}</p><p className="mt-1 text-xs text-slate-500">{submission.batchName}</p></div><div className="shrink-0 text-right"><p className="font-semibold text-slate-900">{formatMoney(submission.quoteAmount)}</p><p className="mt-1 text-xs text-slate-500">{submission.deliveryDays} хоног</p></div></div></Link>
          })}
        </CardContent></Card>

        <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-lg">Санал авч буй тендерүүд</CardTitle><p className="mt-1 text-sm text-slate-500">Хугацаа болон дараагийн хийх үйлдэл</p></CardHeader><CardContent className="space-y-3">
          {openTenders.map((tender) => <Link key={tender.id} href={`/tenders/${tender.id}`} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:bg-slate-50"><div className="rounded-lg bg-orange-50 p-2"><CalendarDays className="h-4 w-4 text-orange-600" /></div><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-medium text-slate-900">{tender.title}</p><div className="mt-2 flex items-center justify-between gap-2"><span className="text-xs text-slate-500">{tender.id}</span><span className="text-xs font-medium text-orange-700">{tender.deadline}</span></div></div></Link>)}
          <Link href="/tenders/open" className="block"><Button className="w-full bg-orange-500 hover:bg-orange-600">Нээлттэй тендер үзэх<ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
        </CardContent></Card>
      </div>
    </div>
  )
}

function Stat({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: typeof Clock3; tone: string }) {
  return <Card className="border-slate-200 shadow-sm"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{value}</p></div><div className={`rounded-xl p-3 ${tone}`}><Icon className="h-5 w-5" /></div></div><p className="mt-3 text-xs text-slate-500">{detail}</p></CardContent></Card>
}
