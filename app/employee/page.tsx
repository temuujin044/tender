"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, CalendarClock, CheckCircle2, FileEdit, FilePlus2, Files, Send, UsersRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EMPLOYEE_STORE_EVENT, formatEmployeeMoney, getEmployeeTenders, getTenderCompletion, type EmployeeTender } from "@/lib/dummy-employee-store"

const status = {
  draft: { label: "Ноорог", className: "bg-slate-100 text-slate-700" },
  ready: { label: "Бэлэн", className: "bg-blue-100 text-blue-700" },
  published: { label: "Нийтэлсэн", className: "bg-emerald-100 text-emerald-700" },
  closed: { label: "Хаагдсан", className: "bg-violet-100 text-violet-700" },
}

export default function EmployeeDashboard() {
  const [tenders, setTenders] = useState<EmployeeTender[]>([])
  useEffect(() => {
    const sync = () => setTenders(getEmployeeTenders())
    sync(); window.addEventListener(EMPLOYEE_STORE_EVENT, sync)
    return () => window.removeEventListener(EMPLOYEE_STORE_EVENT, sync)
  }, [])

  const drafts = tenders.filter((item) => item.status === "draft").length
  const ready = tenders.filter((item) => item.status === "ready").length
  const published = tenders.filter((item) => item.status === "published").length

  return <div className="p-6 lg:p-8">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[.14em] text-orange-600">Тендерийн ажилтан</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Хяналтын самбар</h1><p className="mt-2 text-slate-500">Тендерийн бэлтгэл, нийтлэлт болон үнэлгээний явцыг хянана.</p></div><Link href="/employee/tenders/new"><Button className="bg-orange-500 hover:bg-orange-600"><FilePlus2 className="mr-2 h-4 w-4" />Шинэ тендер</Button></Link></div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Нийт тендер" value={tenders.length} detail="Таны үүсгэсэн" icon={Files} tone="bg-slate-100 text-slate-700" />
        <Stat label="Ноорог" value={drafts} detail="Мэдээлэл дутуу" icon={FileEdit} tone="bg-amber-50 text-amber-700" />
        <Stat label="Нийтлэхэд бэлэн" value={ready} detail="Хяналт хүлээж буй" icon={CheckCircle2} tone="bg-blue-50 text-blue-700" />
        <Stat label="Нийтэлсэн" value={published} detail="Санал авч буй" icon={Send} tone="bg-emerald-50 text-emerald-700" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <Card className="border-slate-200 shadow-sm"><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle className="text-lg">Сүүлийн тендерүүд</CardTitle><p className="mt-1 text-sm text-slate-500">Шинэчлэгдсэн дарааллаар</p></div><Link href="/employee/tenders"><Button variant="ghost" size="sm">Бүгдийг харах<ArrowRight className="ml-2 h-4 w-4" /></Button></Link></CardHeader><CardContent className="space-y-3">
          {tenders.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5).map((tender) => { const completion = getTenderCompletion(tender); return <Link key={tender.id} href={`/employee/tenders/${tender.id}`} className="block rounded-xl border border-slate-200 p-4 hover:border-orange-200 hover:bg-orange-50/30"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge className={status[tender.status].className}>{status[tender.status].label}</Badge><span className="text-xs text-slate-500">{tender.tenderCode}</span></div><p className="mt-2 truncate font-semibold text-slate-900">{tender.name || "Нэр өгөөгүй тендер"}</p><p className="mt-1 text-xs text-slate-500">{tender.department || "Хэлтэс сонгоогүй"} • {formatEmployeeMoney(tender.budget)}</p></div><div className="w-full sm:w-32"><div className="mb-1 flex justify-between text-xs"><span className="text-slate-500">Бүрдүүлэлт</span><span className="font-semibold text-slate-700">{completion.percent}%</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-500" style={{ width: `${completion.percent}%` }} /></div></div></div></Link> })}
        </CardContent></Card>

        <Card className="border-slate-200 shadow-sm"><CardHeader><CardTitle className="text-lg">Анхаарах ажлууд</CardTitle></CardHeader><CardContent className="space-y-3">
          <Task icon={UsersRound} title="Үнэлгээний хороо бүрдүүлэх" detail="МАК-2026-021" tone="text-amber-700 bg-amber-50" />
          <Task icon={CalendarClock} title="Санал авах хугацаа ойртсон" detail="МАК-2026-018 • 9 хоног" tone="text-red-700 bg-red-50" />
          <Task icon={FileEdit} title="Ноорог үргэлжлүүлэх" detail={`${drafts} тендер`} tone="text-blue-700 bg-blue-50" />
        </CardContent></Card>
      </div>
    </div>
  </div>
}

function Stat({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: typeof Files; tone: string }) { return <Card className="border-slate-200"><CardContent className="p-5"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{value}</p></div><span className={`rounded-xl p-3 ${tone}`}><Icon className="h-5 w-5" /></span></div><p className="mt-3 text-xs text-slate-500">{detail}</p></CardContent></Card> }
function Task({ icon: Icon, title, detail, tone }: { icon: typeof Files; title: string; detail: string; tone: string }) { return <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><span className={`rounded-lg p-2 ${tone}`}><Icon className="h-4 w-4" /></span><div><p className="text-sm font-medium text-slate-900">{title}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div></div> }
