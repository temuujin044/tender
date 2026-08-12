"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { notFound, useRouter } from "next/navigation"
import { ArrowLeft, Banknote, Building2, Calendar, CheckCircle2, Clock3, Download, FileText, Loader2, MessageSquare, PackageCheck, Send, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useAuthState } from "@/hooks/use-auth-state"
import { getLoginRedirectPath } from "@/lib/auth"
import { addDummyComment, DUMMY_STORE_EVENT, formatMoney, getDummyComments, getDummyParticipations, getDummySubmissions, setDummyParticipation, type DummyComment, type DummySubmission } from "@/lib/dummy-tender-store"
import { getTenderById, isPublicTenderStatus, statusConfig } from "@/lib/tender-data"
import type { Tender } from "@/lib/tender-data"
import { EMPLOYEE_STORE_EVENT, getPublishedEmployeeTendersForVendor } from "@/lib/dummy-employee-store"

const requirementLabels = { required: "Ерөнхий шаардлага", technical: "Техникийн шаардлага", financial: "Санхүүгийн шаардлага" }

export default function TenderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { isAuthenticated, isReady } = useAuthState()
  const staticTender = getTenderById(id)
  const [tender, setTender] = useState<Tender | null>(staticTender ?? null)
  const [tenderReady, setTenderReady] = useState(Boolean(staticTender))
  const [participating, setParticipating] = useState(false)
  const [submissions, setSubmissions] = useState<DummySubmission[]>([])
  const [comments, setComments] = useState<DummyComment[]>([])
  const [commentTitle, setCommentTitle] = useState("")
  const [commentMessage, setCommentMessage] = useState("")
  const [notice, setNotice] = useState("")

  const isPublicTender = tender ? isPublicTenderStatus(tender.status) : false
  const isOpen = tender?.status === "open" || tender?.status === "closing-soon"

  useEffect(() => {
    if (staticTender) return
    const sync = () => {
      setTender(getPublishedEmployeeTendersForVendor().find((item) => item.id === id) ?? null)
      setTenderReady(true)
    }
    sync()
    window.addEventListener(EMPLOYEE_STORE_EVENT, sync)
    return () => window.removeEventListener(EMPLOYEE_STORE_EVENT, sync)
  }, [id, staticTender])

  useEffect(() => {
    if (tenderReady && isReady && !isAuthenticated && !isPublicTender) router.replace(getLoginRedirectPath(`/tenders/${id}`))
  }, [id, isAuthenticated, isPublicTender, isReady, router, tenderReady])

  useEffect(() => {
    const sync = () => {
      setParticipating(getDummyParticipations().includes(id))
      setSubmissions(getDummySubmissions().filter((item) => item.tenderId === id))
      setComments(getDummyComments(id))
    }
    sync()
    window.addEventListener(DUMMY_STORE_EVENT, sync)
    if (new URLSearchParams(window.location.search).get("submitted")) setNotice("Таны үнийн санал амжилттай хадгалагдлаа. Хяналтын самбараас явцыг хянах боломжтой.")
    return () => window.removeEventListener(DUMMY_STORE_EVENT, sync)
  }, [id])

  if (!tenderReady) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  if (!tender) notFound()
  if ((!isPublicTender && !isReady) || (!isPublicTender && !isAuthenticated)) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  const joinTender = () => {
    if (!isAuthenticated) return router.push(getLoginRedirectPath(`/tenders/${id}`))
    setDummyParticipation(id)
    setParticipating(true)
    setNotice("Оролцох хүсэлт бүртгэгдлээ. Одоо багцаа сонгон үнийн санал илгээнэ үү.")
  }

  const downloadDocument = (name: string) => {
    const blob = new Blob([`${tender.id} — ${name}\n\nЭнэ нь UI туршилтын dummy баримт бичиг.`], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${name}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const submitComment = (event: React.FormEvent) => {
    event.preventDefault()
    if (!isAuthenticated) return router.push(getLoginRedirectPath(`/tenders/${id}`))
    if (!commentTitle.trim() || !commentMessage.trim()) return
    addDummyComment(id, commentTitle.trim(), commentMessage.trim())
    setCommentTitle("")
    setCommentMessage("")
  }

  return (
    <div className="bg-slate-50/70 py-8 lg:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Link href="/tenders/open" className="mb-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Тендерийн жагсаалт руу буцах</Link>

        {notice && <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><span>{notice}</span></div>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={statusConfig[tender.status].className}>{statusConfig[tender.status].label}</Badge>
              <span className="text-sm font-medium text-slate-500">{tender.invitationCode}</span><span className="text-slate-400">•</span><span className="text-sm text-slate-500">{tender.id}</span>
            </div>
            <h1 className="mt-3 max-w-4xl text-3xl font-bold tracking-tight text-slate-900">{tender.title}</h1>
            <p className="mt-4 max-w-4xl leading-7 text-slate-600">{tender.description}</p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-600">
              <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-orange-500" />{tender.department}</span>
              <span className="flex items-center gap-2"><Users className="h-4 w-4 text-orange-500" />{tender.purchaseType}</span>
              <span className="flex items-center gap-2"><Calendar className="h-4 w-4 text-orange-500" />Нийтэлсэн: {tender.publishDate}</span>
            </div>
          </section>

          <Card className="h-fit border-slate-200 shadow-sm lg:sticky lg:top-6"><CardContent className="p-6">
            <div className="flex items-center justify-between text-sm text-slate-500"><span>Төсөвт өртөг</span><Banknote className="h-5 w-5 text-orange-500" /></div>
            <p className="mt-1 text-2xl font-bold text-slate-900">{tender.value}</p>
            <div className="mt-5 border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between text-sm text-slate-500"><span>Санал авах хугацаа</span><Clock3 className="h-5 w-5 text-orange-500" /></div>
              <p className="mt-1 font-semibold text-slate-900">{tender.deadline}</p><p className="mt-1 text-xs text-slate-500">Нээх: {tender.openDate}</p>
            </div>
            {isOpen ? <div className="mt-6 space-y-3">
              {!participating ? <Button onClick={joinTender} className="h-11 w-full bg-orange-500 hover:bg-orange-600"><PackageCheck className="mr-2 h-4 w-4" />Оролцох хүсэлт илгээх</Button> :
                <Link href={`/tenders/${id}/submit`} className="block"><Button className="h-11 w-full bg-orange-500 hover:bg-orange-600"><Send className="mr-2 h-4 w-4" />{submissions.length ? "Саналаа засах" : "Үнийн санал илгээх"}</Button></Link>}
              <p className="text-center text-xs leading-5 text-slate-500">{participating ? "Оролцох хүсэлт бүртгэгдсэн" : "Эхлээд оролцох хүсэлтээ баталгаажуулна"}</p>
            </div> : <div className="mt-6 rounded-lg bg-slate-100 p-3 text-center text-sm text-slate-600">Санал хүлээн авах хугацаа дууссан</div>}
          </CardContent></Card>
        </div>

        <Tabs defaultValue="overview" className="mt-10">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
            <TabsTrigger value="overview">Ерөнхий</TabsTrigger><TabsTrigger value="requirements">Шаардлага ({tender.requirements.length})</TabsTrigger><TabsTrigger value="documents">Баримт ({tender.documents.length})</TabsTrigger><TabsTrigger value="clarification">Тодруулга ({comments.length})</TabsTrigger><TabsTrigger value="timeline">Үйл явц</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card className="border-slate-200"><CardHeader><CardTitle className="text-base">Урилгын мэдээлэл</CardTitle></CardHeader><CardContent><dl className="space-y-4 text-sm">
              {[["Урилгын код", tender.invitationCode], ["Тендерийн код", tender.id], ["Тендерийн төрөл", tender.purchaseType], ["Ангилал", tender.category], ["Эхлэх огноо", tender.startDate], ["Нээх огноо", tender.openDate]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-slate-100 pb-3 last:border-0"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium text-slate-900">{value}</dd></div>)}
            </dl></CardContent></Card>
            <Card className="border-slate-200"><CardHeader><CardTitle className="text-base">Таны оролцооны төлөв</CardTitle></CardHeader><CardContent>
              {submissions.length ? submissions.map((submission) => <div key={submission.id} className="mb-3 rounded-xl border border-slate-200 p-4 last:mb-0">
                <div className="flex items-center justify-between gap-3"><p className="font-medium text-slate-900">{submission.batchName}</p><Badge variant="secondary">{submission.status === "submitted" ? "Илгээсэн" : submission.status === "under-review" ? "Хянагдаж байна" : "Шалгарсан"}</Badge></div>
                <p className="mt-2 text-lg font-bold text-slate-900">{formatMoney(submission.quoteAmount)}</p><p className="mt-1 text-xs text-slate-500">Хүргэлт: {submission.deliveryDate} • {submission.deliveryDays} хоног</p>
              </div>) : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Одоогоор үнийн санал илгээгээгүй байна.</div>}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="requirements" className="mt-5"><Card className="border-slate-200"><CardContent className="p-6"><div className="divide-y divide-slate-100">
            {tender.requirements.map((requirement) => <div key={requirement.id} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" /><div className="flex-1"><p className="font-medium text-slate-900">{requirement.name}</p><p className="mt-1 text-xs text-slate-500">{requirementLabels[requirement.type]}{requirement.documentRequired ? " • Нотлох баримт хавсаргана" : ""}</p></div></div>)}
          </div></CardContent></Card></TabsContent>

          <TabsContent value="documents" className="mt-5"><Card className="border-slate-200"><CardContent className="divide-y divide-slate-100 p-6">
            {tender.documents.map((document) => <div key={document.name} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"><div className="flex min-w-0 items-center gap-3"><div className="rounded-lg bg-orange-50 p-2.5"><FileText className="h-5 w-5 text-orange-600" /></div><div className="min-w-0"><p className="truncate font-medium text-slate-900">{document.name}</p><p className="text-xs text-slate-500">{document.type.toUpperCase()} • {document.size}</p></div></div><Button variant="outline" size="sm" onClick={() => downloadDocument(document.name)}><Download className="mr-2 h-4 w-4" />Татах</Button></div>)}
          </CardContent></Card></TabsContent>

          <TabsContent value="clarification" className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
            <Card className="border-slate-200"><CardHeader><CardTitle className="text-base">Асуулт, хариулт</CardTitle></CardHeader><CardContent className="space-y-4">
              {comments.length ? comments.map((comment) => <div key={comment.id} className={`rounded-xl border p-4 ${comment.author === "buyer" ? "border-orange-100 bg-orange-50/60" : "border-slate-200 bg-white"}`}><div className="flex items-center justify-between gap-3"><p className="font-medium text-slate-900">{comment.title}</p><span className="text-xs text-slate-500">{comment.author === "buyer" ? "Захиалагч" : "Нийлүүлэгч"}</span></div><p className="mt-2 text-sm leading-6 text-slate-600">{comment.message}</p></div>) : <p className="py-10 text-center text-sm text-slate-500">Тодруулга одоогоор алга.</p>}
            </CardContent></Card>
            <Card className="h-fit border-slate-200"><CardHeader><CardTitle className="text-base">Тодруулга илгээх</CardTitle></CardHeader><CardContent><form onSubmit={submitComment} className="space-y-4"><div className="space-y-2"><Label htmlFor="comment-title">Гарчиг</Label><Input id="comment-title" value={commentTitle} onChange={(event) => setCommentTitle(event.target.value)} placeholder="Асуултын товч гарчиг" /></div><div className="space-y-2"><Label htmlFor="comment-message">Асуулт</Label><Textarea id="comment-message" value={commentMessage} onChange={(event) => setCommentMessage(event.target.value)} placeholder="Тодруулах зүйлээ дэлгэрэнгүй бичнэ үү" className="min-h-28" /></div><Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600"><MessageSquare className="mr-2 h-4 w-4" />Илгээх</Button></form></CardContent></Card>
          </TabsContent>

          <TabsContent value="timeline" className="mt-5"><Card className="border-slate-200"><CardContent className="p-6"><div>
            {tender.timeline.map((item, index) => <div key={`${item.event}-${item.date}`} className="relative flex gap-4 pb-7 last:pb-0">{index < tender.timeline.length - 1 && <div className="absolute left-[9px] top-5 h-full w-px bg-slate-200" />}<div className={`relative z-10 mt-1 h-5 w-5 shrink-0 rounded-full border-4 ${item.complete ? "border-orange-100 bg-orange-500" : "border-slate-100 bg-slate-300"}`} /><div><p className="font-medium text-slate-900">{item.event}</p><p className="mt-1 text-sm text-slate-500">{item.date}</p></div></div>)}
          </div></CardContent></Card></TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
