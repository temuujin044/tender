"use client"

import { use, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { notFound, useRouter } from "next/navigation"
import { AlertCircle, ArrowLeft, ArrowRight, CalendarClock, Check, CheckCircle2, ClipboardCheck, FileCheck2, FileText, Layers3, Loader2, Plus, Save, Send, Settings2, Trash2, Upload, UsersRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { formatEmployeeMoney, getEmployeeTender, getTenderCompletion, publishEmployeeTender, saveEmployeeTender, type EmployeeCriterion, type EmployeeMember, type EmployeeRequirement, type EmployeeTender } from "@/lib/dummy-employee-store"

const steps = [
  { id: 1, label: "Үндсэн мэдээлэл", icon: Settings2 },
  { id: 2, label: "Урилга, хугацаа", icon: CalendarClock },
  { id: 3, label: "Багц", icon: Layers3 },
  { id: 4, label: "Шаардлага, шалгуур", icon: ClipboardCheck },
  { id: 5, label: "Баримт бичиг", icon: FileCheck2 },
  { id: 6, label: "Үнэлгээний хороо", icon: UsersRound },
  { id: 7, label: "Хянаж нийтлэх", icon: Send },
]

const roleNames: Record<EmployeeMember["role"], string> = { secretary: "Нарийн бичиг", chair: "Дарга", member: "Гишүүн", "internal-control": "Дотоод хяналт" }
const requirementNames: Record<EmployeeRequirement["type"], string> = { general: "Ерөнхий", technical: "Техникийн", financial: "Санхүүгийн" }
const criterionNames: Record<EmployeeCriterion["type"], string> = { technical: "Техникийн", financial: "Санхүүгийн", experience: "Туршлага" }

const employees = [
  { name: "Б. Номин", position: "Худалдан авалтын мэргэжилтэн", email: "nomin@mak.mn" },
  { name: "Д. Энхболд", position: "Хангамжийн газрын захирал", email: "enkhbold@mak.mn" },
  { name: "С. Тэмүүлэн", position: "Дотоод хяналтын мэргэжилтэн", email: "temuulen@mak.mn" },
  { name: "О. Мөнхзул", position: "Санхүүгийн шинжээч", email: "munkhzul@mak.mn" },
  { name: "Г. Батзориг", position: "Техникийн ахлах инженер", email: "batzorig@mak.mn" },
]

export default function EmployeeTenderEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [tender, setTender] = useState<EmployeeTender | null>(null)
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [batchDraft, setBatchDraft] = useState({ code: "", name: "" })
  const [requirementDraft, setRequirementDraft] = useState<{ name: string; type: EmployeeRequirement["type"]; documentRequired: boolean }>({ name: "", type: "general", documentRequired: true })
  const [criterionDraft, setCriterionDraft] = useState<{ name: string; type: EmployeeCriterion["type"]; weight: string }>({ name: "", type: "technical", weight: "" })
  const [memberDraft, setMemberDraft] = useState({ employeeEmail: "", role: "member" as EmployeeMember["role"] })

  useEffect(() => { setTender(getEmployeeTender(id) ?? null) }, [id])
  const completion = useMemo(() => tender ? getTenderCompletion(tender) : null, [tender])
  const criteriaWeight = tender?.criteria.reduce((sum, item) => sum + item.weight, 0) ?? 0

  if (tender === null) {
    if (typeof window !== "undefined" && !getEmployeeTender(id)) notFound()
    return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>
  }

  const update = <K extends keyof EmployeeTender>(key: K, value: EmployeeTender[K]) => {
    setTender((current) => current ? { ...current, [key]: value } : current)
    setErrors((current) => { const next = { ...current }; delete next[key]; return next })
    setSaved(false)
  }

  const validateCurrentStep = () => {
    const next: Record<string, string> = {}
    if (step === 1) {
      if (!tender.name.trim()) next.name = "Тендерийн нэр шаардлагатай."
      if (!tender.tenderType) next.tenderType = "Тендерийн төрлийг сонгоно уу."
      if (!tender.purchaseType) next.purchaseType = "Худалдан авалтын төрлийг сонгоно уу."
      if (!tender.department) next.department = "Хариуцсан нэгжийг сонгоно уу."
      if (!tender.budget) next.budget = "Төсөвт өртгийг оруулна уу."
    }
    if (step === 2) {
      for (const key of ["startDate", "endDate", "acceptDate", "openDate", "evaluationDate"] as const) if (!tender[key]) next[key] = "Огноо шаардлагатай."
      if (tender.acceptDate && tender.openDate && tender.acceptDate >= tender.openDate) next.openDate = "Нээх хугацаа санал хүлээн авах хугацаанаас хойш байна."
    }
    if (step === 3 && tender.batches.length === 0) next.batches = "Багадаа нэг багц нэмнэ үү."
    if (step === 4) {
      if (!tender.requirements.length) next.requirements = "Багадаа нэг шаардлага нэмнэ үү."
      if (!tender.criteria.length) next.criteria = "Багадаа нэг шалгуур нэмнэ үү."
      else if (criteriaWeight !== 100) next.criteria = `Шалгуурын нийт жин 100% байх ёстой. Одоогоор ${criteriaWeight}%.`
    }
    if (step === 5 && !tender.documents.length) next.documents = "Багадаа нэг тендерийн баримт хавсаргана уу."
    if (step === 6) {
      for (const role of ["secretary", "chair", "internal-control"] as const) if (!tender.members.some((member) => member.role === role)) next.members = "Нарийн бичиг, Дарга, Дотоод хяналтын гишүүд заавал байна."
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const saveDraft = async (quiet = false) => {
    setSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 350))
    const currentCompletion = getTenderCompletion(tender)
    const nextStatus = tender.status === "published" || tender.status === "closed" ? tender.status : currentCompletion.percent === 100 ? "ready" : "draft"
    const result = saveEmployeeTender({ ...tender, status: nextStatus })
    setTender(result); setSaving(false); setSaved(true)
    if (!quiet) window.setTimeout(() => setSaved(false), 2200)
    return result
  }

  const goNext = async () => {
    if (!validateCurrentStep()) return
    await saveDraft(true)
    setStep((current) => Math.min(current + 1, 7)); window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const addBatch = () => {
    if (!batchDraft.code.trim() || !batchDraft.name.trim()) return
    update("batches", [...tender.batches, { id: `B-${Date.now()}`, code: batchDraft.code.trim(), name: batchDraft.name.trim() }]); setBatchDraft({ code: "", name: "" })
  }
  const addRequirement = () => {
    if (!requirementDraft.name.trim()) return
    update("requirements", [...tender.requirements, { id: `R-${Date.now()}`, ...requirementDraft, name: requirementDraft.name.trim() }]); setRequirementDraft({ name: "", type: "general", documentRequired: true })
  }
  const addCriterion = () => {
    const weight = Number(criterionDraft.weight)
    if (!criterionDraft.name.trim() || weight <= 0 || weight > 100 || criteriaWeight + weight > 100) return
    update("criteria", [...tender.criteria, { id: `C-${Date.now()}`, name: criterionDraft.name.trim(), type: criterionDraft.type, weight }]); setCriterionDraft({ name: "", type: "technical", weight: "" })
  }
  const uploadDocuments = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    update("documents", [...tender.documents, ...files.map((file) => ({ id: `D-${Date.now()}-${file.name}`, name: file.name, type: "tender" as const, size: `${(file.size / 1024 / 1024).toFixed(2)} MB` }))])
  }
  const addMember = () => {
    const employee = employees.find((item) => item.email === memberDraft.employeeEmail)
    if (!employee || tender.members.some((item) => item.email === employee.email && item.role === memberDraft.role)) return
    update("members", [...tender.members, { id: `M-${Date.now()}`, ...employee, role: memberDraft.role }]); setMemberDraft({ employeeEmail: "", role: "member" })
  }
  const publish = async () => {
    await saveDraft(true)
    const result = publishEmployeeTender(id)
    if (result) setTender(result)
    setPublishOpen(false)
  }

  return <div className="p-6 lg:p-8"><div className="mx-auto max-w-7xl">
    <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div><Link href="/employee/tenders" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Тендерийн жагсаалт</Link><div className="mt-4 flex flex-wrap items-center gap-2"><Badge variant="secondary">{tender.status === "draft" ? "Ноорог" : tender.status === "ready" ? "Нийтлэхэд бэлэн" : tender.status === "published" ? "Нийтэлсэн" : "Хаагдсан"}</Badge><span className="text-sm font-medium text-slate-500">{tender.tenderCode}</span><span className="text-xs text-slate-400">{tender.invitationCode}</span></div><h1 className="mt-2 text-2xl font-bold text-slate-900">{tender.name || "Шинэ тендер"}</h1><p className="mt-1 text-sm text-slate-500">Сүүлд хадгалсан: {new Date(tender.updatedAt).toLocaleString("mn-MN")}</p></div>
      <div className="flex items-center gap-3"><span className={cn("text-sm font-medium transition-opacity", saved ? "text-emerald-600" : "opacity-0")}><CheckCircle2 className="mr-1 inline h-4 w-4" />Хадгаллаа</span><Button variant="outline" onClick={() => saveDraft()} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Ноорог хадгалах</Button></div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-6">
        <div className="mb-3 rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between text-xs"><span className="text-slate-500">Нийт бүрдүүлэлт</span><span className="font-bold text-slate-700">{completion?.percent}%</span></div><div className="mt-2 h-2 rounded-full bg-slate-200"><div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${completion?.percent}%` }} /></div></div>
        <nav className="space-y-1">{steps.map((item) => { const Icon = item.icon; const sectionDone = item.id <= 6 ? completion?.checks[item.id - 1] : completion?.percent === 100; return <button key={item.id} type="button" onClick={() => setStep(item.id)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors", step === item.id ? "bg-orange-50 font-semibold text-orange-700" : "text-slate-600 hover:bg-slate-50")}><span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", step === item.id ? "bg-orange-500 text-white" : sectionDone ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500")}>{sectionDone && step !== item.id ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span><span>{item.label}</span></button>})}</nav>
      </aside>

      <main>
        {step === 1 && <Section title="Үндсэн мэдээлэл" description="TBLTENDER хүснэгтийн үндсэн талбаруудыг бөглөнө."><div className="grid gap-5 sm:grid-cols-2">
          <Field label="Тендерийн нэр" error={errors.name} wide><Input value={tender.name} onChange={(event) => update("name", event.target.value)} placeholder="Тендерийн нэр" /></Field>
          <Field label="Тендерийн код"><Input value={tender.tenderCode} readOnly className="bg-slate-50" /></Field><Field label="Урилгын код"><Input value={tender.invitationCode} readOnly className="bg-slate-50" /></Field>
          <Field label="Тендерийн төрөл" error={errors.tenderType}><Select value={tender.tenderType} onValueChange={(value) => update("tenderType", value)}><SelectTrigger><SelectValue placeholder="Сонгох" /></SelectTrigger><SelectContent><SelectItem value="Бараа">Бараа</SelectItem><SelectItem value="Ажил">Ажил</SelectItem><SelectItem value="Үйлчилгээ">Үйлчилгээ</SelectItem><SelectItem value="Зөвлөх үйлчилгээ">Зөвлөх үйлчилгээ</SelectItem></SelectContent></Select></Field>
          <Field label="Худалдан авалтын төрөл" error={errors.purchaseType}><Select value={tender.purchaseType} onValueChange={(value) => update("purchaseType", value)}><SelectTrigger><SelectValue placeholder="Сонгох" /></SelectTrigger><SelectContent><SelectItem value="Нээлттэй тендер">Нээлттэй тендер</SelectItem><SelectItem value="Үнийн санал авах">Үнийн санал авах</SelectItem><SelectItem value="Хязгаарлагдмал тендер">Хязгаарлагдмал тендер</SelectItem></SelectContent></Select></Field>
          <Field label="Хариуцсан нэгж" error={errors.department}><Select value={tender.department} onValueChange={(value) => update("department", value)}><SelectTrigger><SelectValue placeholder="Сонгох" /></SelectTrigger><SelectContent>{["Хангамжийн газар", "Уурхайн техникийн газар", "Мэдээллийн технологийн газар", "Үйл ажиллагааны газар", "Хүний нөөц, захиргааны газар"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Төсөвт өртөг (₮)" error={errors.budget}><Input type="number" min="0" value={tender.budget || ""} onChange={(event) => update("budget", Number(event.target.value))} placeholder="0" /><p className="text-xs font-medium text-orange-600">{formatEmployeeMoney(tender.budget)}</p></Field>
          <Field label="Тайлбар" wide><Textarea value={tender.description} onChange={(event) => update("description", event.target.value)} placeholder="Тендерийн зорилго, хамрах хүрээ..." className="min-h-28" /></Field>
        </div></Section>}

        {step === 2 && <Section title="Урилга болон хугацаа" description="Санал хүлээн авах, нээх, үнэлэх хугацааг дарааллаар тохируулна."><div className="grid gap-5 sm:grid-cols-2">
          <Field label="Гэрээ эхлэх огноо" error={errors.startDate}><Input type="date" value={tender.startDate} onChange={(event) => update("startDate", event.target.value)} /></Field><Field label="Гэрээ дуусах огноо" error={errors.endDate}><Input type="date" value={tender.endDate} onChange={(event) => update("endDate", event.target.value)} /></Field>
          <Field label="Санал хүлээн авах эцсийн хугацаа" error={errors.acceptDate}><Input type="datetime-local" value={tender.acceptDate} onChange={(event) => update("acceptDate", event.target.value)} /></Field><Field label="Санал нээх хугацаа" error={errors.openDate}><Input type="datetime-local" value={tender.openDate} onChange={(event) => update("openDate", event.target.value)} /></Field>
          <Field label="Үнэлгээ дуусах огноо" error={errors.evaluationDate}><Input type="date" value={tender.evaluationDate} onChange={(event) => update("evaluationDate", event.target.value)} /></Field><Field label="Урилгын тэмдэглэл"><Input value={tender.note} onChange={(event) => update("note", event.target.value)} placeholder="Нэмэлт нөхцөл" /></Field>
        </div><div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800"><CalendarClock className="mt-0.5 h-5 w-5 shrink-0" /><p>Backend-ийн урсгалаар санал нээх хугацаа нь санал хүлээн авах эцсийн хугацаанаас хойш байна.</p></div></Section>}

        {step === 3 && <Section title="Тендерийн багц" description="TBLTENDERBATCH-т хадгалагдах багцууд. Нийлүүлэгч багц тус бүрээр үнийн санал өгнө."><div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]"><Input value={batchDraft.code} onChange={(event) => setBatchDraft((current) => ({ ...current, code: event.target.value }))} placeholder="БАГЦ-01" /><Input value={batchDraft.name} onChange={(event) => setBatchDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Багцын нэр" /><Button type="button" onClick={addBatch} className="bg-orange-500 hover:bg-orange-600"><Plus className="mr-2 h-4 w-4" />Нэмэх</Button></div>{errors.batches && <ErrorText>{errors.batches}</ErrorText>}<div className="mt-5 space-y-3">{tender.batches.map((batch) => <Row key={batch.id} title={batch.name} meta={batch.code} onDelete={() => update("batches", tender.batches.filter((item) => item.id !== batch.id))} />)}</div></Section>}

        {step === 4 && <div className="space-y-6"><Section title="Тавигдах шаардлага" description="Нийлүүлэгчийн хангах ерөнхий, техникийн болон санхүүгийн шаардлагууд."><div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]"><Input value={requirementDraft.name} onChange={(event) => setRequirementDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Шаардлагын нэр" /><Select value={requirementDraft.type} onValueChange={(value: EmployeeRequirement["type"]) => setRequirementDraft((current) => ({ ...current, type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="general">Ерөнхий</SelectItem><SelectItem value="technical">Техникийн</SelectItem><SelectItem value="financial">Санхүүгийн</SelectItem></SelectContent></Select><label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm"><Checkbox checked={requirementDraft.documentRequired} onCheckedChange={(checked) => setRequirementDraft((current) => ({ ...current, documentRequired: checked === true }))} />Баримт шаардах</label><Button type="button" onClick={addRequirement}><Plus className="h-4 w-4" /></Button></div>{errors.requirements && <ErrorText>{errors.requirements}</ErrorText>}<div className="mt-4 space-y-2">{tender.requirements.map((item) => <Row key={item.id} title={item.name} meta={`${requirementNames[item.type]}${item.documentRequired ? " • Баримттай" : ""}`} onDelete={() => update("requirements", tender.requirements.filter((value) => value.id !== item.id))} />)}</div></Section>
          <Section title="Үнэлгээний шалгуур" description={`Нийт жин заавал 100% байна. Одоогийн нийлбэр: ${criteriaWeight}%`}><div className="grid gap-3 lg:grid-cols-[1fr_180px_120px_auto]"><Input value={criterionDraft.name} onChange={(event) => setCriterionDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Шалгуурын нэр" /><Select value={criterionDraft.type} onValueChange={(value: EmployeeCriterion["type"]) => setCriterionDraft((current) => ({ ...current, type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="technical">Техникийн</SelectItem><SelectItem value="financial">Санхүүгийн</SelectItem><SelectItem value="experience">Туршлага</SelectItem></SelectContent></Select><Input type="number" min="1" max="100" value={criterionDraft.weight} onChange={(event) => setCriterionDraft((current) => ({ ...current, weight: event.target.value }))} placeholder="Жин %" /><Button type="button" onClick={addCriterion}><Plus className="h-4 w-4" /></Button></div>{errors.criteria && <ErrorText>{errors.criteria}</ErrorText>}<div className="mt-4 space-y-2">{tender.criteria.map((item) => <Row key={item.id} title={item.name} meta={`${criterionNames[item.type]} • ${item.weight}%`} onDelete={() => update("criteria", tender.criteria.filter((value) => value.id !== item.id))} />)}</div><div className="mt-4 h-2 rounded-full bg-slate-100"><div className={cn("h-full rounded-full", criteriaWeight === 100 ? "bg-emerald-500" : criteriaWeight > 100 ? "bg-red-500" : "bg-orange-500")} style={{ width: `${Math.min(criteriaWeight, 100)}%` }} /></div></Section></div>}

        {step === 5 && <Section title="Тендерийн баримт бичиг" description="Техникийн тодорхойлолт, маягт болон гэрээний төслийг хавсаргана."><label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center hover:border-orange-300"><Upload className="mx-auto h-9 w-9 text-slate-400" /><p className="mt-3 text-sm font-medium text-slate-700">Файл сонгох эсвэл энд чирж оруулах</p><p className="mt-1 text-xs text-slate-500">PDF, DOCX, XLSX — dummy metadata байдлаар хадгална</p><input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={uploadDocuments} /></label>{errors.documents && <ErrorText>{errors.documents}</ErrorText>}<div className="mt-5 space-y-3">{tender.documents.map((document) => <Row key={document.id} title={document.name} meta={`${document.type.toUpperCase()} • ${document.size}`} icon={<FileText className="h-5 w-5 text-orange-500" />} onDelete={() => update("documents", tender.documents.filter((item) => item.id !== document.id))} />)}</div></Section>}

        {step === 6 && <Section title="Үнэлгээний хороо" description="Backend-ийн нээх дараалал: Нарийн бичиг → Дарга → Дотоод хяналт."><div className="grid gap-3 lg:grid-cols-[1fr_220px_auto]"><Select value={memberDraft.employeeEmail} onValueChange={(value) => setMemberDraft((current) => ({ ...current, employeeEmail: value }))}><SelectTrigger><SelectValue placeholder="Ажилтан сонгох" /></SelectTrigger><SelectContent>{employees.map((employee) => <SelectItem key={employee.email} value={employee.email}>{employee.name} — {employee.position}</SelectItem>)}</SelectContent></Select><Select value={memberDraft.role} onValueChange={(value: EmployeeMember["role"]) => setMemberDraft((current) => ({ ...current, role: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="secretary">Нарийн бичиг</SelectItem><SelectItem value="chair">Дарга</SelectItem><SelectItem value="member">Гишүүн</SelectItem><SelectItem value="internal-control">Дотоод хяналт</SelectItem></SelectContent></Select><Button type="button" onClick={addMember} className="bg-orange-500 hover:bg-orange-600"><Plus className="mr-2 h-4 w-4" />Нэмэх</Button></div>{errors.members && <ErrorText>{errors.members}</ErrorText>}<div className="mt-5 grid gap-3 md:grid-cols-2">{tender.members.map((member) => <div key={member.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 font-bold text-orange-600">{member.name.slice(0, 1)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-slate-900">{member.name}</p><Badge variant="secondary">{roleNames[member.role]}</Badge></div><p className="mt-1 text-xs text-slate-500">{member.position}</p><p className="mt-1 text-xs text-slate-400">{member.email}</p></div><Button type="button" variant="ghost" size="icon" onClick={() => update("members", tender.members.filter((item) => item.id !== member.id))}><Trash2 className="h-4 w-4" /></Button></div>)}</div></Section>}

        {step === 7 && <Section title="Хянаж нийтлэх" description="Бүх хэсгийг шалгасны дараа нийлүүлэгчдэд тендерийн урилгыг нийтэлнэ."><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{steps.slice(0, 6).map((item, index) => { const done = completion?.checks[index]; const Icon = item.icon; return <button type="button" key={item.id} onClick={() => setStep(item.id)} className={cn("rounded-xl border p-4 text-left", done ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60")}><div className="flex items-center justify-between"><Icon className={cn("h-5 w-5", done ? "text-emerald-600" : "text-amber-600")} />{done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-amber-600" />}</div><p className="mt-3 font-medium text-slate-900">{item.label}</p><p className="mt-1 text-xs text-slate-500">{done ? "Бүрэн" : "Мэдээлэл дутуу"}</p></button> })}</div><div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5"><dl className="grid gap-4 text-sm sm:grid-cols-2"><Summary label="Тендер" value={tender.name || "—"} /><Summary label="Код" value={tender.tenderCode} /><Summary label="Төсөв" value={formatEmployeeMoney(tender.budget)} /><Summary label="Санал хүлээн авах" value={tender.acceptDate.replace("T", " ") || "—"} /><Summary label="Багц" value={`${tender.batches.length}`} /><Summary label="Шалгуурын жин" value={`${criteriaWeight}%`} /></dl></div><div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-orange-100 bg-orange-50 p-5"><div><p className="font-semibold text-slate-900">Нийлүүлэгчдэд нийтлэх</p><p className="mt-1 text-sm text-slate-600">Нийтэлсний дараа тендер Vendor талын нээлттэй жагсаалтад харагдах төлөвт орно.</p></div><Button type="button" disabled={completion?.percent !== 100 || tender.status === "published"} onClick={() => setPublishOpen(true)} className="shrink-0 bg-orange-500 hover:bg-orange-600"><Send className="mr-2 h-4 w-4" />{tender.status === "published" ? "Нийтэлсэн" : "Нийтлэх"}</Button></div></Section>}

        <div className="mt-6 flex justify-between gap-3"><Button variant="outline" disabled={step === 1} onClick={() => setStep((current) => Math.max(current - 1, 1))}><ArrowLeft className="mr-2 h-4 w-4" />Өмнөх</Button>{step < 7 && <Button onClick={goNext} className="bg-orange-500 hover:bg-orange-600">Хадгалаад үргэлжлүүлэх<ArrowRight className="ml-2 h-4 w-4" /></Button>}</div>
      </main>
    </div>
  </div>

  <Dialog open={publishOpen} onOpenChange={setPublishOpen}><DialogContent><DialogHeader><DialogTitle>Тендерийг нийтлэх үү?</DialogTitle><DialogDescription>{tender.tenderCode} тендерийн урилга нийлүүлэгчдэд нээлттэй болно. Энэ demo хувилбарт зөвхөн localStorage төлөв шинэчлэгдэнэ.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setPublishOpen(false)}>Цуцлах</Button><Button onClick={publish} className="bg-orange-500 hover:bg-orange-600"><Send className="mr-2 h-4 w-4" />Нийтлэх</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <Card className="border-slate-200 shadow-sm"><CardHeader className="border-b border-slate-100"><CardTitle className="text-xl">{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="p-6">{children}</CardContent></Card> }
function Field({ label, error, wide, children }: { label: string; error?: string; wide?: boolean; children: React.ReactNode }) { return <div className={cn("space-y-2", wide && "sm:col-span-2")}><Label>{label}<span className="text-red-500">*</span></Label>{children}{error && <p className="text-xs text-red-600">{error}</p>}</div> }
function ErrorText({ children }: { children: React.ReactNode }) { return <p className="mt-3 flex items-center gap-2 text-sm text-red-600"><AlertCircle className="h-4 w-4" />{children}</p> }
function Row({ title, meta, icon, onDelete }: { title: string; meta: string; icon?: React.ReactNode; onDelete: () => void }) { return <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">{icon ?? <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-sm font-bold text-orange-600"><Check className="h-4 w-4" /></span>}<div className="min-w-0 flex-1"><p className="font-medium text-slate-900">{title}</p><p className="mt-1 text-xs text-slate-500">{meta}</p></div><Button type="button" variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4 text-slate-400" /></Button></div> }
function Summary({ label, value }: { label: string; value: string }) { return <div><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-900">{value}</dd></div> }
