"use client"

export type EmployeeTenderStatus = "draft" | "ready" | "published" | "closed"

export type EmployeeBatch = { id: string; code: string; name: string }
export type EmployeeRequirement = { id: string; name: string; type: "general" | "technical" | "financial"; documentRequired: boolean }
export type EmployeeCriterion = { id: string; name: string; type: "technical" | "financial" | "experience"; weight: number }
export type EmployeeDocument = { id: string; name: string; type: "tender" | "template" | "contract"; size: string }
export type EmployeeMember = { id: string; name: string; position: string; role: "secretary" | "chair" | "member" | "internal-control"; email: string }

export type EmployeeTender = {
  id: string
  tenderId: number
  invitationId: number
  tenderCode: string
  invitationCode: string
  name: string
  tenderType: string
  purchaseType: string
  department: string
  budget: number
  publishDate: string
  startDate: string
  endDate: string
  acceptDate: string
  openDate: string
  evaluationDate: string
  description: string
  note: string
  status: EmployeeTenderStatus
  batches: EmployeeBatch[]
  requirements: EmployeeRequirement[]
  criteria: EmployeeCriterion[]
  documents: EmployeeDocument[]
  members: EmployeeMember[]
  createdBy: string
  updatedAt: string
}

const STORAGE_KEY = "mak_tender_employee_tenders"
export const EMPLOYEE_STORE_EVENT = "mak-tender-employee-store-change"

const initialTenders: EmployeeTender[] = [
  {
    id: "EMP-118", tenderId: 118, invitationId: 3018, tenderCode: "МАК-2026-018", invitationCode: "УТ-3018",
    name: "Уулын хүнд даацын автомашины дугуй нийлүүлэх", tenderType: "Бараа", purchaseType: "Нээлттэй тендер",
    department: "Хангамжийн газар", budget: 1850000000, publishDate: "2026-08-04", startDate: "2026-08-04",
    endDate: "2026-09-30", acceptDate: "2026-08-21T17:00", openDate: "2026-08-22T10:00", evaluationDate: "2026-09-04",
    description: "Уурхайн хүнд даацын автомашины дугуйг техникийн шаардлагын дагуу нийлүүлнэ.", note: "Саналын валют MNT байна.", status: "published",
    batches: [{ id: "B-1801", code: "БАГЦ-01", name: "27.00R49 хэмжээтэй дугуй" }, { id: "B-1802", code: "БАГЦ-02", name: "33.00R51 хэмжээтэй дугуй" }],
    requirements: [{ id: "R-1", name: "Улсын бүртгэлийн гэрчилгээ", type: "general", documentRequired: true }, { id: "R-2", name: "Ижил төрлийн нийлүүлэлтийн 3 жилийн туршлага", type: "technical", documentRequired: true }],
    criteria: [{ id: "C-1", name: "Техникийн шаардлагын нийцэл", type: "technical", weight: 60 }, { id: "C-2", name: "Үнийн үнэлгээ", type: "financial", weight: 40 }],
    documents: [{ id: "D-1", name: "Техникийн тодорхойлолт.pdf", type: "tender", size: "2.8 MB" }, { id: "D-2", name: "Үнийн саналын маягт.xlsx", type: "template", size: "184 KB" }],
    members: [{ id: "M-1", name: "Д. Энхболд", position: "Хангамжийн газрын захирал", role: "chair", email: "enkhbold@mak.mn" }, { id: "M-2", name: "Б. Номин", position: "Худалдан авалтын мэргэжилтэн", role: "secretary", email: "nomin@mak.mn" }, { id: "M-3", name: "С. Тэмүүлэн", position: "Дотоод хяналтын мэргэжилтэн", role: "internal-control", email: "temuulen@mak.mn" }],
    createdBy: "Б. Худалдан авалт", updatedAt: "2026-08-11T08:30:00.000Z",
  },
  {
    id: "EMP-121", tenderId: 121, invitationId: 3021, tenderCode: "МАК-2026-021", invitationCode: "УТ-3021",
    name: "Нарийн сухайтын уурхайн сэлбэг хэрэгсэл", tenderType: "Бараа", purchaseType: "Үнийн санал авах",
    department: "Уурхайн техникийн газар", budget: 740000000, publishDate: "", startDate: "2026-08-25", endDate: "2026-10-15",
    acceptDate: "2026-09-05T17:00", openDate: "2026-09-06T10:00", evaluationDate: "2026-09-12",
    description: "CAT 785 болон Komatsu HD785 автомашины сэлбэг хэрэгслийн худалдан авалт.", note: "", status: "ready",
    batches: [{ id: "B-2101", code: "БАГЦ-01", name: "CAT 785 сэлбэг" }],
    requirements: [{ id: "R-21", name: "Үйлдвэрлэгчийн гарал үүслийн гэрчилгээ", type: "general", documentRequired: true }],
    criteria: [{ id: "C-21", name: "Техникийн нийцэл", type: "technical", weight: 70 }, { id: "C-22", name: "Үнийн санал", type: "financial", weight: 30 }],
    documents: [{ id: "D-21", name: "Сэлбэгийн жагсаалт.xlsx", type: "template", size: "92 KB" }],
    members: [], createdBy: "Б. Худалдан авалт", updatedAt: "2026-08-12T01:20:00.000Z",
  },
  {
    id: "EMP-122", tenderId: 122, invitationId: 3022, tenderCode: "МАК-2026-022", invitationCode: "УТ-3022",
    name: "Цагаан суваргын кемпийн угаалгын үйлчилгээ", tenderType: "Үйлчилгээ", purchaseType: "Нээлттэй тендер",
    department: "Үйл ажиллагааны газар", budget: 0, publishDate: "", startDate: "", endDate: "", acceptDate: "", openDate: "", evaluationDate: "",
    description: "", note: "", status: "draft", batches: [], requirements: [], criteria: [], documents: [], members: [],
    createdBy: "Б. Худалдан авалт", updatedAt: "2026-08-12T02:00:00.000Z",
  },
]

function read() {
  if (typeof window === "undefined") return initialTenders
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as EmployeeTender[] ?? initialTenders } catch { return initialTenders }
}

function write(value: EmployeeTender[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  window.dispatchEvent(new Event(EMPLOYEE_STORE_EVENT))
}

export function getEmployeeTenders() { return read() }
export function getEmployeeTender(id: string) { return read().find((item) => item.id === id) }

export function createEmployeeTender(createdBy: string) {
  const all = read()
  const tenderId = Math.max(122, ...all.map((item) => item.tenderId)) + 1
  const year = new Date().getFullYear()
  const next: EmployeeTender = {
    id: `EMP-${tenderId}`, tenderId, invitationId: 3000 + tenderId,
    tenderCode: `МАК-${year}-${String(tenderId - 100).padStart(3, "0")}`, invitationCode: `УТ-${3000 + tenderId}`,
    name: "", tenderType: "", purchaseType: "", department: "", budget: 0,
    publishDate: "", startDate: "", endDate: "", acceptDate: "", openDate: "", evaluationDate: "",
    description: "", note: "", status: "draft", batches: [], requirements: [], criteria: [], documents: [], members: [],
    createdBy, updatedAt: new Date().toISOString(),
  }
  write([next, ...all])
  return next
}

export function saveEmployeeTender(tender: EmployeeTender) {
  const next = { ...tender, updatedAt: new Date().toISOString() }
  const all = read()
  const index = all.findIndex((item) => item.id === tender.id)
  if (index >= 0) all[index] = next
  else all.unshift(next)
  write(all)
  return next
}

export function publishEmployeeTender(id: string) {
  const tender = getEmployeeTender(id)
  if (!tender) return null
  tender.status = "published"
  tender.publishDate = new Date().toISOString().slice(0, 10)
  return saveEmployeeTender(tender)
}

export function getTenderCompletion(tender: EmployeeTender) {
  const checks = [
    Boolean(tender.name && tender.tenderType && tender.purchaseType && tender.department && tender.budget),
    Boolean(tender.startDate && tender.endDate && tender.acceptDate && tender.openDate && tender.evaluationDate),
    tender.batches.length > 0,
    tender.requirements.length > 0 && tender.criteria.length > 0 && tender.criteria.reduce((sum, item) => sum + item.weight, 0) === 100,
    tender.documents.length > 0,
    ["secretary", "chair", "internal-control"].every((role) => tender.members.some((member) => member.role === role)),
  ]
  return { completed: checks.filter(Boolean).length, total: checks.length, percent: Math.round((checks.filter(Boolean).length / checks.length) * 100), checks }
}

export function formatEmployeeMoney(value: number) {
  return `${new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 0 }).format(value)} ₮`
}

export function getPublishedEmployeeTendersForVendor() {
  return read().filter((item) => item.status === "published").map((item) => ({
    id: item.tenderCode,
    tenderId: item.tenderId,
    invitationId: item.invitationId,
    invitationCode: item.invitationCode,
    title: item.name,
    description: item.description || item.note || "Тендерийн урилгын дэлгэрэнгүй мэдээлэл.",
    category: item.tenderType,
    purchaseType: item.purchaseType,
    publishDate: item.publishDate.replaceAll("-", "."),
    startDate: item.startDate.replaceAll("-", "."),
    deadline: item.acceptDate.replace("T", " ").replaceAll("-", "."),
    openDate: item.openDate.replace("T", " ").replaceAll("-", "."),
    status: "open" as const,
    value: formatEmployeeMoney(item.budget),
    department: item.department,
    documents: item.documents.map((document) => ({
      name: document.name,
      size: document.size,
      type: document.name.split(".").pop() ?? "file",
      category: document.type,
    })),
    requirements: item.requirements.map((requirement, index) => ({
      id: item.tenderId * 100 + index,
      name: requirement.name,
      type: requirement.type === "general" ? "required" as const : requirement.type,
      documentRequired: requirement.documentRequired,
    })),
    batches: item.batches.map((batch, index) => ({ id: item.tenderId * 100 + index, code: batch.code, name: batch.name })),
    timeline: [
      { event: "Тендер нийтэлсэн", date: item.publishDate.replaceAll("-", "."), complete: true },
      { event: "Санал хүлээн авах эцсийн хугацаа", date: item.acceptDate.replace("T", " ").replaceAll("-", ".") },
      { event: "Санал нээх", date: item.openDate.replace("T", " ").replaceAll("-", ".") },
      { event: "Үнэлгээ дуусах", date: item.evaluationDate.replaceAll("-", ".") },
    ],
  }))
}
