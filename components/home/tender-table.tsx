"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, CalendarDays, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { categories, statusConfig, tenders } from "@/lib/tender-data"

export function TenderTable() {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const publicTenders = tenders.filter((tender) => tender.status === "open" || tender.status === "closing-soon")
  const filtered = useMemo(() => publicTenders.filter((tender) => {
    const matchesText = `${tender.title} ${tender.id} ${tender.invitationCode}`.toLowerCase().includes(query.toLowerCase())
    return matchesText && (category === "all" || tender.category === category)
  }), [category, publicTenders, query])

  return (
    <section className="bg-slate-50 py-16 lg:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div><p className="text-sm font-semibold uppercase tracking-wider text-orange-600">Шинэ боломжууд</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Санал авч буй тендерүүд</h2><p className="mt-2 text-slate-500">Нийлүүлэгчээр бүртгүүлж, тохирох багцдаа үнийн санал ирүүлээрэй.</p></div>
          <Link href="/tenders/open"><Button variant="outline">Бүх тендерийг харах<ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
        </div>

        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-white"><div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Тендерийн нэр, кодоор хайх" className="pl-9" /></div><Select value={category} onValueChange={setCategory}><SelectTrigger className="sm:w-56"><SelectValue placeholder="Ангилал" /></SelectTrigger><SelectContent><SelectItem value="all">Бүх ангилал</SelectItem>{categories.filter((item) => item !== "Бүх ангилал").map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div></CardHeader>
          <CardContent className="p-0">
            {filtered.length ? <div className="divide-y divide-slate-100">{filtered.map((tender) => <Link key={tender.id} href={`/tenders/${tender.id}`} className="group grid gap-4 p-5 transition-colors hover:bg-orange-50/30 md:grid-cols-[minmax(0,1fr)_180px_170px_auto] md:items-center">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge className={statusConfig[tender.status].className}>{statusConfig[tender.status].label}</Badge><span className="text-xs font-medium text-slate-500">{tender.invitationCode}</span></div><p className="mt-2 font-semibold text-slate-900 group-hover:text-orange-700">{tender.title}</p><p className="mt-1 text-xs text-slate-500">{tender.id} • {tender.category}</p></div>
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
