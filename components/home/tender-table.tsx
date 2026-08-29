"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowRight, CalendarDays, Loader2, RefreshCw, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTenderCatalog } from "@/hooks/use-tenders"
import { statusConfig } from "@/lib/tender-data"

export function TenderTable() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const { tenders: publicTenders, loading, error, reload } = useTenderCatalog("all")
  const categoryOptions = useMemo(() => Array.from(new Set(publicTenders.map((tender) => tender.category))), [publicTenders])
  const activeCount = publicTenders.filter((tender) => tender.status === "open" || tender.status === "closing-soon").length

  const filtered = useMemo(() => publicTenders.filter((tender) => {
    const matchesText = `${tender.title} ${tender.tenderCode ?? tender.id} ${tender.invitationCode}`.toLowerCase().includes(query.toLowerCase())
    return matchesText && (category === "all" || tender.category === category)
  }), [category, publicTenders, query])

  return (
    <section id="open-tenders" className="scroll-mt-16 bg-slate-50 py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div><p className="text-sm font-semibold uppercase tracking-wider text-orange-600">Бодит мэдээлэл</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Сүүлийн тендерүүд</h2><p className="mt-2 text-slate-500">Backend мэдээллийн сан дахь урилга, хугацаа болон үр дүн.</p></div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />{activeCount} тендер санал авч байна</div>
        </div>

        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-white"><div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Тендерийн нэр, кодоор хайх" className="pl-9" /></div><Select value={category} onValueChange={setCategory}><SelectTrigger className="sm:w-56"><SelectValue placeholder="Ангилал" /></SelectTrigger><SelectContent><SelectItem value="all">Бүх ангилал</SelectItem>{categoryOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div></CardHeader>
          <CardContent className="p-0">
            {loading ? <div className="flex items-center justify-center gap-3 p-14 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-orange-500" />Backend-ээс тендерүүдийг ачаалж байна...</div> : error ? <div className="p-12 text-center"><AlertCircle className="mx-auto h-8 w-8 text-red-500" /><p className="mt-3 text-sm font-medium text-red-700">{error}</p><Button type="button" variant="outline" className="mt-4" onClick={() => void reload()}><RefreshCw className="mr-2 h-4 w-4" />Дахин оролдох</Button></div> : filtered.length ? <div className="divide-y divide-slate-100">{filtered.slice(0, 10).map((tender) => <Link key={tender.id} href={`/tenders/${tender.id}`} className="group grid gap-4 p-5 transition-colors hover:bg-orange-50/30 md:grid-cols-[minmax(0,1fr)_180px_170px_auto] md:items-center">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge className={statusConfig[tender.status].className}>{statusConfig[tender.status].label}</Badge><span className="text-xs font-medium text-slate-500">{tender.invitationCode}</span></div><p className="mt-2 font-semibold text-slate-900 group-hover:text-orange-700">{tender.title}</p><p className="mt-1 text-xs text-slate-500">{tender.tenderCode ?? tender.id} • {tender.category}</p></div>
              <div><p className="text-xs text-slate-500">Захиалагч нэгж</p><p className="mt-1 text-sm font-medium text-slate-700">{tender.department}</p></div>
              <div><p className="text-xs text-slate-500">Эцсийн хугацаа</p><p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-700"><CalendarDays className="h-4 w-4 text-orange-500" />{tender.deadline}</p></div>
              <ArrowRight className="hidden h-5 w-5 text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-orange-500 md:block" />
            </Link>)}</div> : <div className="p-14 text-center text-sm text-slate-500">Хайлтад тохирох тендер олдсонгүй.</div>}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
