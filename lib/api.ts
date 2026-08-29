import type { CompanyFormData } from "@/lib/company-form"
import { countryOptions, getOptionLabel } from "@/lib/company-form"
import type { Tender, TenderDocument, TenderRequirement, TenderStatus } from "@/lib/tender-data"
import type { EmployeeMember, EmployeeTender } from "@/lib/employee-tender"

const API_PREFIX = "/backend-api"

function normalizeApiPath(path: string) {
  const queryIndex = path.indexOf("?")
  const pathname = queryIndex >= 0 ? path.slice(0, queryIndex) : path
  const query = queryIndex >= 0 ? path.slice(queryIndex) : ""
  return `${pathname.replace(/\/+$/, "")}${query}`
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData
  const response = await fetch(`${API_PREFIX}${normalizeApiPath(path)}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  })

  const contentType = response.headers.get("content-type") ?? ""
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const record = typeof body === "object" && body ? body as Record<string, unknown> : null
    const message = record?.message ?? record?.error ?? record?.RetMsg ?? record?.retMsg ?? record?.ret_msg
    throw new ApiError(typeof message === "string" ? message : `Backend хүсэлт амжилтгүй боллоо (${response.status}).`, response.status)
  }

  return body as T
}

type ApiEnvelope<T> = {
  RetType?: number
  RetMsg?: string
  RetData?: T
  retType?: number
  retMsg?: string
  retData?: T
  ret_type?: number
  ret_msg?: string
  ret_data?: T
}

export type ApiInvitationRow = {
  invitationid: number
  invitationcode?: string | null
  tenderid: number
  tendername?: string | null
  tendercode?: string | null
  departmentname?: string | null
  tendertypename?: string | null
  purchasetypename?: string | null
  startdate?: string | null
  enddate?: string | null
  acceptdate?: string | null
  opendate?: string | null
  publishdate?: string | null
  dateinterval?: string | null
  budget?: number | string | null
  recieved?: number | null
  comment?: string | null
  balanceday?: number | null
  status?: string | number | null
  isselect?: number | null
}

type CatalogScope = "all" | "open" | "result" | "saved"

function unwrapRetData<T>(response: ApiEnvelope<T>): T {
  const retType = response.RetType ?? response.retType ?? response.ret_type ?? 0
  if (retType !== 0 && response.RetMsg) throw new ApiError(response.RetMsg)
  if (retType !== 0) throw new ApiError(response.retMsg ?? response.ret_msg ?? "Backend өгөгдөл буцаасангүй.")
  return (response.RetData ?? response.retData ?? response.ret_data) as T
}

function clean(value: unknown, fallback = "Мэдээлэл оруулаагүй"): string {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text || fallback
}

export function formatApiDate(value: string | null | undefined, includeTime = true): string {
  if (!value) return "Товлоогүй"
  const normalized = value.replace("T", " ").replace(/Z$/, "")
  const [date, time] = normalized.split(" ")
  const formattedDate = date.replaceAll("-", ".")
  if (!includeTime || !time) return formattedDate
  return `${formattedDate} ${time.slice(0, 5)}`
}

function money(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount) || amount === 0) return "Төсөв зарлаагүй"
  return `${new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 0 }).format(amount)} ₮`
}

function invitationStatus(row: ApiInvitationRow, source: Exclude<CatalogScope, "all">): TenderStatus {
  if (source === "result") return Number(row.isselect ?? 0) > 0 ? "awarded" : "closed"
  if (source === "saved") {
    const accept = row.acceptdate ? Date.parse(row.acceptdate.replace(" ", "T")) : Number.NaN
    return Number.isFinite(accept) && accept > Date.now() ? "upcoming" : "closed"
  }
  const days = Number(row.balanceday ?? -1)
  if (days < 0) return "closed"
  return days <= 3 ? "closing-soon" : "open"
}

function rowToTender(row: ApiInvitationRow, source: Exclude<CatalogScope, "all">): Tender {
  const status = invitationStatus(row, source)
  return {
    id: String(row.invitationid),
    tenderId: Number(row.tenderid),
    invitationId: Number(row.invitationid),
    tenderCode: clean(row.tendercode, "Код бүртгэгдээгүй"),
    invitationCode: clean(row.invitationcode, "Урилгын код бүртгэгдээгүй"),
    title: clean(row.tendername, "Нэр өгөөгүй тендер"),
    description: clean(row.comment, "Тендерийн дэлгэрэнгүй мэдээллийг нээн үзнэ үү."),
    category: clean(row.tendertypename, "Бусад"),
    purchaseType: clean(row.purchasetypename, "Тендер"),
    publishDate: formatApiDate(row.publishdate, false),
    startDate: formatApiDate(row.startdate, false),
    deadline: formatApiDate(row.acceptdate),
    openDate: formatApiDate(row.opendate),
    status,
    value: money(row.budget),
    department: clean(row.departmentname, "Хариуцсан нэгж тодорхойгүй"),
    documents: [],
    requirements: [],
    batches: [],
    timeline: [
      { event: "Тендер нийтэлсэн", date: formatApiDate(row.publishdate, false), complete: true },
      { event: "Санал хүлээн авах эцсийн хугацаа", date: formatApiDate(row.acceptdate), complete: status !== "open" && status !== "closing-soon" },
      { event: "Санал нээх", date: formatApiDate(row.opendate), complete: status === "closed" || status === "awarded" },
    ],
  }
}

async function fetchInvitationRows(endpoint: string) {
  const response = await apiRequest<ApiEnvelope<ApiInvitationRow[]>>(`/maktender/${endpoint}/`)
  return unwrapRetData(response) ?? []
}

export async function fetchTenderCatalog(scope: CatalogScope = "all"): Promise<Tender[]> {
  const endpoints: Record<Exclude<CatalogScope, "all">, string> = {
    saved: "getInvList",
    open: "getInvListVendor",
    result: "getInvListResult",
  }
  const requests: { source: Exclude<CatalogScope, "all">; endpoint: string }[] = scope === "all"
    ? [{ source: "saved", endpoint: "getInvList" }, { source: "open", endpoint: "getInvListOpen" }, { source: "result", endpoint: "getInvListResult" }]
    : [{ source: scope, endpoint: endpoints[scope] }]
  const groups = await Promise.all(requests.map(async ({ source, endpoint }) => ({ source, rows: await fetchInvitationRows(endpoint) })))
  const byId = new Map<number, Tender>()
  for (const group of groups) {
    for (const row of group.rows) byId.set(row.invitationid, rowToTender(row, group.source))
  }
  return Array.from(byId.values()).sort((a, b) => b.invitationId - a.invitationId)
}

export async function fetchVendorTenders(vendorId: number): Promise<Tender[]> {
  const [participated, involved] = await Promise.all([
    apiRequest<ApiEnvelope<ApiInvitationRow[]>>(`/maktender/getInvListParticipated/?vendorid=${vendorId}`),
    apiRequest<ApiEnvelope<ApiInvitationRow[]>>(`/maktender/getInvListInvolved/?vendorid=${vendorId}`),
  ])
  const byId = new Map<number, Tender>()
  for (const row of [...(unwrapRetData(participated) ?? []), ...(unwrapRetData(involved) ?? [])]) {
    byId.set(row.invitationid, rowToTender(row, "open"))
  }
  return Array.from(byId.values()).sort((a, b) => b.invitationId - a.invitationId)
}

type VendorNotificationRow = {
  invitationid: number
  invitationcode?: string | null
  tenderid: number
  tendercode?: string | null
  tendername?: string | null
  status?: number | null
  statusname?: string | null
  publishdate?: string | null
  acceptdate?: string | null
  opendate?: string | null
  balanceday?: number | null
  participated?: number | null
  selected?: number | null
  joineddate?: string | null
}

export type VendorNotification = {
  id: number
  invitationId: number
  invitationCode: string
  tenderCode: string
  title: string
  statusName: string
  type: "deadline" | "status" | "new" | "result"
  time: string
}

export async function fetchVendorNotifications(vendorId: number): Promise<VendorNotification[]> {
  const response = await apiRequest<ApiEnvelope<VendorNotificationRow[]>>(
    `/notifications/vendor/?vendorid=${vendorId}`,
  )
  return (unwrapRetData(response) ?? []).map((row) => {
    const status = Number(row.status ?? 0)
    const participated = Number(row.participated ?? 0) > 0
    const selected = Number(row.selected ?? 0) > 0
    const balanceDay = Number(row.balanceday ?? -1)
    const type: VendorNotification["type"] = selected || status >= 7
      ? "result"
      : participated
        ? "status"
        : balanceDay >= 0 && balanceDay <= 3
          ? "deadline"
          : "new"
    const eventDate = participated && row.joineddate
      ? row.joineddate
      : status >= 7
        ? row.opendate || row.acceptdate || row.publishdate
        : row.acceptdate || row.publishdate
    return {
      id: row.invitationid,
      invitationId: row.invitationid,
      invitationCode: clean(row.invitationcode, "Урилгын код бүртгэгдээгүй"),
      tenderCode: clean(row.tendercode, "Код бүртгэгдээгүй"),
      title: clean(row.tendername, "Нэр өгөөгүй тендер"),
      statusName: clean(row.statusname, "Төлөв бүртгэгдээгүй"),
      type,
      time: clean(eventDate, "Огноо бүртгэгдээгүй"),
    }
  })
}

type InvitationHeader = {
  tenderid?: number | null
  tendername?: string | null
  departmentname?: string | null
  tendertypename?: string | null
  purchasetypename?: string | null
  tendercode?: string | null
  invitationcode?: string | null
  description?: string | null
  startdate?: string | null
  enddate?: string | null
  opendate?: string | null
  balanceday?: number | null
  status?: number | null
  statusname?: string | null
  delaynote?: string | null
}

type InvitationCriterion = { criteriaid: number; criteriatypeid?: number | null; criteriatypename?: string | null; criterianame?: string | null; weight?: string | number | null; visible?: number | null }
type InvitationRequirement = { requireid: number; requiretypeid?: number | null; requirename?: string | null; requirevalue?: string | null; criterianame?: string | null; visible?: number | null }
type InvitationDocument = { documentname?: string | null; filename?: string | null; filetype?: string | null; sourceid?: number | null; sourcetype?: string | null; filepath?: string | null }
type InvitationBatch = { batchid: number; batchcode?: string | null; batchname?: string | null }
type InvitationMember = { evaluationid: number; empid?: number | null; empname?: string | null; positionname?: string | null; email?: string | null; roleid?: number | null; membertypename?: string | null }

function invitationMemberRole(member: InvitationMember): EmployeeMember["role"] {
  const roleId = Number(member.roleid)
  const roleText = `${member.membertypename ?? ""} ${member.positionname ?? ""}`.toLowerCase()
  if (roleId === 1) return "chair"
  if (roleId === 2) return "secretary"
  if (roleId === 4 || roleText.includes("дотоод хяналт")) return "internal-control"
  return "member"
}

function requirementType(value: string): TenderRequirement["type"] {
  const normalized = value.toLowerCase()
  if (normalized.includes("санхүү") || normalized.includes("үнэ")) return "financial"
  if (normalized.includes("техник") || normalized.includes("туршлага")) return "technical"
  return "required"
}

function documentCategory(value: string): TenderDocument["category"] {
  const normalized = value.toLowerCase()
  if (normalized.includes("гэрээ")) return "contract"
  if (normalized.includes("маягт") || normalized.includes("загвар")) return "template"
  return "tender"
}

export async function fetchTenderDetail(invitationId: number): Promise<Tender> {
  const catalogPromise = fetchTenderCatalog("all")
  const detailPromise = apiRequest<{ data: unknown[][] }>(`/maktender/invDetail/?invitationid=${invitationId}`)
  const [catalog, detailResponse] = await Promise.all([catalogPromise, detailPromise])
  const base = catalog.find((item) => item.invitationId === invitationId)
  const detail = detailResponse.data ?? []
  const header = (detail[0]?.[0] ?? {}) as InvitationHeader
  const requirements = (detail[2] ?? []) as InvitationRequirement[]
  const documents = (detail[4] ?? []) as InvitationDocument[]
  const batches = (detail[5] ?? []) as InvitationBatch[]

  if (!base && !header.tendername) throw new ApiError("Тендерийн мэдээлэл олдсонгүй.", 404)

  const fallback: Tender = base ?? {
    id: String(invitationId), tenderId: Number(header.tenderid ?? 0), invitationId, invitationCode: clean(header.invitationcode, "Урилгын код бүртгэгдээгүй"),
    tenderCode: clean(header.tendercode, "Кодгүй"), title: clean(header.tendername, "Нэр өгөөгүй тендер"),
    description: "", category: clean(header.tendertypename, "Бусад"), purchaseType: clean(header.purchasetypename, "Тендер"),
    publishDate: formatApiDate(header.startdate, false), startDate: formatApiDate(header.startdate, false), deadline: formatApiDate(header.enddate),
    openDate: formatApiDate(header.opendate), status: Number(header.balanceday ?? -1) >= 0 ? "open" : "closed", value: "Төсөв зарлаагүй",
    department: clean(header.departmentname), documents: [], requirements: [], batches: [], timeline: [],
  }

  const mappedRequirements: TenderRequirement[] = requirements
    .filter((item) => item.visible !== 0)
    .map((item) => {
      const name = clean(item.requirename ?? item.requirevalue ?? item.criterianame, "Нэргүй шаардлага")
      return { id: item.requireid, name, type: requirementType(name), documentRequired: true }
    })
  return {
    ...fallback,
    tenderCode: clean(header.tendercode, fallback.tenderCode ?? fallback.id),
    invitationCode: clean(header.invitationcode, fallback.invitationCode),
    title: clean(header.tendername, fallback.title),
    description: clean(header.description ?? header.delaynote, fallback.description),
    category: clean(header.tendertypename, fallback.category),
    department: clean(header.departmentname, fallback.department),
    startDate: formatApiDate(header.startdate, false),
    deadline: formatApiDate(header.enddate),
    requirements: mappedRequirements,
    batches: batches.map((batch) => ({
      id: Number(batch.batchid),
      code: clean(batch.batchcode, "Багцын код бүртгэгдээгүй"),
      name: clean(batch.batchname, "Багцын нэр бүртгэгдээгүй"),
    })),
    documents: documents.map((item) => {
      const name = clean(item.filename ?? item.documentname, "Баримт бичиг")
      const type = clean(item.filetype, name.split(".").pop() ?? "file").replace(/^\./, "")
      return {
        name,
        type,
        size: "Хэмжээ бүртгэгдээгүй",
        category: documentCategory(clean(item.documentname, name)),
        sourceId: item.sourceid ?? undefined,
        sourceType: item.sourcetype ?? undefined,
        filePath: item.filepath ?? undefined,
      }
    }),
    timeline: [
      { event: "Урилга нийтэлсэн", date: formatApiDate(header.startdate, false), complete: true },
      { event: "Санал хүлээн авах эцсийн хугацаа", date: formatApiDate(header.enddate), complete: Number(header.balanceday ?? -1) < 0 },
      { event: clean(header.statusname, "Одоогийн төлөв"), date: Number(header.balanceday ?? 0) >= 0 ? `${header.balanceday} хоног үлдсэн` : "Хугацаа дууссан", complete: Number(header.balanceday ?? -1) < 0 },
    ],
  }
}

export type VendorSession = {
  success: number
  userid: number
  username: string
  positionname?: string
  vendorid: number
  empid?: number | null
  role?: "vendor" | "employee"
  token?: string
  message?: string
}

export async function loginVendor(username: string, password: string) {
  return apiRequest<VendorSession>("/tenderauth/login", {
    method: "POST",
    body: JSON.stringify({ type: "Vendor", username, password }),
  })
}

export async function registerVendor(form: CompanyFormData) {
  const entityTypes: Record<string, number> = { company: 1, individual: 2, foreign: 3 }
  const statuses: Record<string, number> = { new: 1, active: 1, suspended: 2, inactive: 3, closed: 4 }
  const response = await apiRequest<ApiEnvelope<number>>("/vendor/save/", {
    method: "POST",
    body: JSON.stringify({
      vendorid: 0,
      username: form.username.trim(),
      password: form.password,
      vendorname: form.companyName.trim(),
      registernumber: form.registrationNumber.trim(),
      isvatpayer: form.isVatPayer ? 1 : 0,
      vendortypeid: entityTypes[form.entityType] ?? 1,
      countryname: getOptionLabel(countryOptions, form.country) || form.country,
      establisheddate: form.foundedDate.replaceAll("-", "."),
      activity: form.businessDirection.trim(),
      vendorstatusid: statuses[form.companyStatus] ?? 1,
      address: form.companyAddress.trim(),
      vendorphone: form.companyPhone.trim(),
      vendoremail: form.companyEmail.trim(),
      bankname: "",
      bankaccountname: "",
      bankaccountnumber: "",
      empname: form.contactName.trim(),
      empphone: form.contactPhone.trim(),
      empemail: form.contactEmail.trim(),
      headcompany: form.parentCompany.trim(),
      shareholder: form.shareholders.trim(),
      website: form.website.trim(),
      vendorcategory_ids: "",
    }),
  })
  return unwrapRetData(response)
}

export type VendorProfileRecord = Record<string, unknown> & { vendorid: number }

export async function fetchVendorProfile(vendorId: number) {
  const response = await apiRequest<ApiEnvelope<VendorProfileRecord>>(`/vendor/getInfo/${vendorId}/`)
  const profile = unwrapRetData(response)
  if (!profile?.vendorid) throw new ApiError("Нийлүүлэгчийн профайл олдсонгүй.", 404)
  return profile
}

export async function updateVendorProfile(form: CompanyFormData, vendorId: number, current: VendorProfileRecord) {
  const entityTypes: Record<string, number> = { company: 1, individual: 2, foreign: 3 }
  const statuses: Record<string, number> = { new: 1, active: 1, suspended: 2, inactive: 3, closed: 4 }
  const response = await apiRequest<ApiEnvelope<string>>("/vendor/save/", {
    method: "POST",
    body: JSON.stringify({
      vendorid: vendorId,
      username: form.username.trim(),
      vendorname: form.companyName.trim(), registernumber: form.registrationNumber.trim(), isvatpayer: form.isVatPayer ? 1 : 0,
      vendortypeid: entityTypes[form.entityType] ?? Number(current.vendortypeid ?? 1),
      countryname: form.country === "other"
        ? String(current.countryname ?? getOptionLabel(countryOptions, form.country) ?? form.country)
        : getOptionLabel(countryOptions, form.country) || form.country,
      establisheddate: form.foundedDate.replaceAll("-", "."), activity: form.businessDirection.trim(),
      vendorstatusid: statuses[form.companyStatus] ?? Number(current.vendorstatusid ?? 1), address: form.companyAddress.trim(),
      vendorphone: form.companyPhone.trim(), vendoremail: form.companyEmail.trim(),
      bankname: String(current.bankname ?? ""), bankaccountname: String(current.bankaccountname ?? ""), bankaccountnumber: String(current.bankaccountnumber ?? ""),
      empname: form.contactName.trim(), empphone: form.contactPhone.trim(), empemail: form.contactEmail.trim(),
      headcompany: form.parentCompany.trim(), shareholder: form.shareholders.trim(), website: form.website.trim(),
    }),
  })
  unwrapRetData(response)
}

export type ApiTenderCounts = Record<string, number | string | null>

export async function fetchTenderCounts(year = new Date().getFullYear()) {
  return apiRequest<ApiTenderCounts>("/maktender/getTenderCounts/", {
    method: "POST",
    body: JSON.stringify({ year }),
  })
}

export type ApiComment = Record<string, unknown>

export async function fetchComments(invitationId: number, vendorId: number) {
  const response = await apiRequest<{ comments?: ApiComment[] }>(`/comment/getComments/${invitationId}/${vendorId}/`)
  return response.comments ?? []
}

export async function saveComment(input: { invitationId: number; vendorId: number; title: string; message: string }) {
  const response = await apiRequest<{ RetType?: number; RetMsg?: string }>("/comment/save/", {
    method: "POST",
    body: JSON.stringify({ commenttitle: input.title, comment: input.message, vendorid: input.vendorId, invitationid: input.invitationId }),
  })
  if (response.RetType) throw new ApiError(response.RetMsg ?? "Тодруулга хадгалагдсангүй.")
  return response
}

export type ApiQuote = {
  qouteid: number
  tendername?: string
  tendercode?: string
  qoutedate?: string
  deliverydate?: string
  qouteamount?: number | string
  deliveryday?: number
  batchname?: string | null
}

export async function fetchQuotes(invitationId: number, vendorId: number) {
  const response = await apiRequest<{ quotes?: ApiQuote[] }>(`/quote/getList/${invitationId}/${vendorId}/`)
  return response.quotes ?? []
}

export async function saveQuote(input: { quoteId?: number; quoteDate: string; deliveryDate: string; quoteAmount: number; deliveryDays: number; invitationId: number; tenderId: number; batchId: number; vendorId: number; createdBy: string }) {
  const response = await apiRequest<{ RetType?: number; RetMsg?: string }>("/quote/save/", {
    method: "POST",
    body: JSON.stringify({
      qouteid: input.quoteId ?? 0,
      qoutedate: input.quoteDate,
      deliverydate: input.deliveryDate,
      qouteamount: input.quoteAmount,
      deliveryday: input.deliveryDays,
      invitationid: input.invitationId,
      tenderid: input.tenderId,
      batchid: input.batchId,
      createdby: input.createdBy,
      vendorid: input.vendorId,
    }),
  })
  if (response.RetType) throw new ApiError(response.RetMsg ?? "Үнийн санал хадгалагдсангүй.")
  return response
}

export async function joinTender(input: { invitationId: number; tenderId: number; vendorId: number; createdBy: string }) {
  const response = await apiRequest<{ RetType?: number; RetMsg?: string; retType?: number; retMsg?: string }>("/maktender/insertInvitationOfTender/", {
    method: "POST",
    body: JSON.stringify({ invitation_id: input.invitationId, tender_id: input.tenderId, vendor_id: input.vendorId, createdby: input.createdBy }),
  })
  const failed = response.RetType ?? response.retType ?? 0
  if (failed) throw new ApiError(response.RetMsg ?? response.retMsg ?? "Оролцох хүсэлт хадгалагдсангүй.")
  return response
}

export async function uploadTenderJoinDocument(input: { file: File; invitationId: number; tenderId: number; vendorId: number; createdBy: string; batchId: number; requirementTypeId?: number }) {
  const form = new FormData()
  form.append("file", input.file)
  form.append("invitationid", String(input.invitationId))
  form.append("tenderid", String(input.tenderId))
  form.append("vendorid", String(input.vendorId))
  form.append("createdby", input.createdBy)
  form.append("batchid", String(input.batchId))
  form.append("requiretypeid", String(input.requirementTypeId ?? 0))
  return apiRequest<{ data: { documentid: number; filename: string; sourceid: number; sourcetype: string } }>("/maktender/uploadTenderJoinDocument/", {
    method: "POST",
    body: form,
  })
}

export function getDownloadUrl(sourceId: number, sourceType: string) {
  return `${API_PREFIX}/maktender/downloadFile/?sourceid=${encodeURIComponent(sourceId)}&sourcetype=${encodeURIComponent(sourceType)}`
}

type TenderTypeOption = { tendertypeid: number; tendertypename: string }
type PurchaseTypeOption = { purchasetypeid: number; purchasetypename: string }
type DepartmentOption = { departmentid: number; departmentname: string; depcode?: string }
type TenderBatchOption = { batchid: number; batchcode?: string | null; batchname?: string | null }
type TenderInitialRecord = {
  tenderid: number
  tendercode?: string | null
  tendername?: string | null
  budget?: number | string | null
  evaluationdate?: string | null
  publishdate?: string | null
  startdate?: string | null
  enddate?: string | null
  plandate?: string | null
  createdby?: string | null
  created?: string | null
  tendertype?: number | null
  purchasetypeid?: number | null
  departmentid?: number | null
}

export type EmployeeTenderOptions = {
  tenderTypes: TenderTypeOption[]
  purchaseTypes: PurchaseTypeOption[]
  departments: DepartmentOption[]
}

async function fetchTenderInitialData(tenderId: number) {
  const response = await apiRequest<ApiEnvelope<[TenderTypeOption[], PurchaseTypeOption[], DepartmentOption[], TenderBatchOption[], TenderInitialRecord | null]>>(`/maktender/getTenderInitialData/${tenderId}/`)
  const data = unwrapRetData(response)
  return {
    options: { tenderTypes: data[0] ?? [], purchaseTypes: data[1] ?? [], departments: data[2] ?? [] },
    batches: data[3] ?? [],
    tender: data[4] ?? null,
  }
}

export async function fetchEmployeeTenderOptions(): Promise<EmployeeTenderOptions> {
  return (await fetchTenderInitialData(0)).options
}

function inputDate(value: string | null | undefined, withTime = false) {
  if (!value) return ""
  const normalized = value.replaceAll(".", "-").replace(" ", "T").replace(/Z$/, "")
  return withTime ? normalized.slice(0, 16) : normalized.slice(0, 10)
}

function employeeStatus(status: TenderStatus): EmployeeTender["status"] {
  if (status === "open" || status === "closing-soon") return "published"
  if (status === "closed" || status === "awarded") return "closed"
  return "draft"
}

function catalogTenderToEmployee(tender: Tender): EmployeeTender {
  return {
    id: tender.id,
    tenderId: tender.tenderId,
    invitationId: tender.invitationId,
    tenderCode: tender.tenderCode ?? tender.id,
    invitationCode: tender.invitationCode,
    name: tender.title,
    tenderType: tender.category,
    purchaseType: tender.purchaseType,
    department: tender.department,
    budget: Number(tender.value.replace(/[^0-9]/g, "")) || 0,
    publishDate: inputDate(tender.publishDate),
    startDate: inputDate(tender.startDate),
    endDate: "",
    acceptDate: inputDate(tender.deadline, true),
    openDate: inputDate(tender.openDate, true),
    evaluationDate: "",
    description: tender.description,
    note: "",
    status: employeeStatus(tender.status),
    batches: tender.batches.map((batch) => ({ id: String(batch.id), code: batch.code, name: batch.name })),
    requirements: [], criteria: [], documents: [], members: [],
    createdBy: "",
    updatedAt: inputDate(tender.publishDate) || new Date(0).toISOString(),
  }
}

export async function fetchEmployeeTenders() {
  return (await fetchTenderCatalog("all")).map(catalogTenderToEmployee)
}

export async function fetchEmployeeTender(invitationId: number): Promise<EmployeeTender> {
  const detailRequest = apiRequest<{ data: unknown[][] }>(`/maktender/invDetail/?invitationid=${invitationId}`)
  const tender = await fetchTenderDetail(invitationId)
  const [initial, detailResponse] = await Promise.all([fetchTenderInitialData(tender.tenderId), detailRequest])
  const main = initial.tender
  const raw = detailResponse.data ?? []
  const criteria = (raw[1] ?? []) as InvitationCriterion[]
  const requirements = (raw[2] ?? []) as InvitationRequirement[]
  const notes = (raw[3] ?? []) as Record<string, unknown>[]
  const header = (raw[0]?.[0] ?? {}) as InvitationHeader
  const members = (raw[7] ?? []) as InvitationMember[]
  const mapped = catalogTenderToEmployee(tender)
  return {
    ...mapped,
    budget: Number(main?.budget ?? 0),
    status: header.status === null || header.status === undefined ? "draft" : mapped.status,
    publishDate: inputDate(main?.publishdate),
    startDate: inputDate(main?.startdate),
    endDate: inputDate(main?.enddate),
    evaluationDate: inputDate(main?.evaluationdate),
    batches: initial.batches.length ? initial.batches.map((batch) => ({ id: String(batch.batchid), code: clean(batch.batchcode, "Багцын код бүртгэгдээгүй"), name: clean(batch.batchname, "Багцын нэр бүртгэгдээгүй") })) : mapped.batches,
    requirements: requirements.filter((item) => item.visible !== 0).map((item) => {
      const name = clean(item.requirename ?? item.requirevalue ?? item.criterianame, "Нэргүй шаардлага")
      const type = Number(item.requiretypeid) === 14 ? "financial" : Number(item.requiretypeid) === 35 ? "technical" : "general"
      return { id: String(item.requireid), name, type, documentRequired: true }
    }),
    criteria: criteria.filter((item) => item.visible !== 0).map((item) => {
      const name = clean(item.criterianame ?? item.criteriatypename, "Нэргүй шалгуур")
      const type = Number(item.criteriatypeid) === 1 ? "financial" : Number(item.criteriatypeid) === 24 ? "experience" : "technical"
      return { id: String(item.criteriaid), name, type, weight: Number(item.weight ?? 0) }
    }),
    documents: tender.documents.map((file, index) => ({ id: String(file.sourceId ?? index), name: file.name, type: file.category, size: file.size })),
    members: members.map((member) => ({
      id: String(member.evaluationid),
      employeeId: Number(member.empid ?? 0),
      name: clean(member.empname, "Нэргүй ажилтан"),
      position: clean(member.positionname, "Албан тушаалгүй"),
      email: clean(member.email, ""),
      role: invitationMemberRole(member),
    })),
    note: clean(notes[0]?.address, ""),
    createdBy: clean(main?.createdby, ""),
    updatedAt: main?.created ?? main?.publishdate ?? new Date(0).toISOString(),
  }
}

function findOptionId<T>(options: T[], label: string, getLabel: (option: T) => string, getId: (option: T) => number) {
  const normalized = label.trim().toLowerCase()
  const match = options.find((option) => {
    const candidate = getLabel(option).trim().toLowerCase()
    return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate)
  })
  if (!match) throw new ApiError(`${label} утгад тохирох backend лавлах олдсонгүй.`)
  return getId(match)
}

export async function saveEmployeeTenderToBackend(tender: EmployeeTender) {
  const { options } = await fetchTenderInitialData(tender.tenderId || 0)
  const response = await apiRequest<ApiEnvelope<number>>("/maktender/saveTender/", {
    method: "POST",
    body: JSON.stringify({
      tenderid: tender.tenderId > 0 ? tender.tenderId : 0,
      tendercode: tender.tenderCode,
      tendername: tender.name,
      tendertypeid: findOptionId(options.tenderTypes, tender.tenderType, (item) => item.tendertypename, (item) => item.tendertypeid),
      purchasetypeid: findOptionId(options.purchaseTypes, tender.purchaseType, (item) => item.purchasetypename, (item) => item.purchasetypeid),
      departmentid: findOptionId(options.departments, tender.department, (item) => item.departmentname, (item) => item.departmentid),
      budget: tender.budget,
      evaluationdate: tender.evaluationDate || null,
      publishdate: tender.publishDate || null,
      startdate: tender.startDate || null,
      enddate: tender.endDate || null,
      plandate: tender.startDate || null,
      createdby: tender.createdBy,
      batch: tender.batches.map((batch) => ({ batchname: batch.name })),
    }),
  })
  return unwrapRetData(response)
}

type ApiInvitationHeader = { invitationid: number; invitationcode?: string | null; tender?: number; tenderid?: number }

export async function ensureEmployeeInvitation(tenderId: number, createdBy: string, invitationId = 0) {
  const response = await apiRequest<ApiEnvelope<[ApiInvitationHeader[], unknown[]]>>("/maktender/saveInvitationHeader/", {
    method: "POST",
    body: JSON.stringify({ tenderid: tenderId, createdby: createdBy, invitationid: invitationId }),
  })
  const data = unwrapRetData(response)
  const invitation = data[0]?.[0]
  if (!invitation?.invitationid) throw new ApiError("Тендерийн урилга үүссэнгүй.")
  return invitation
}

export async function saveEmployeeTenderDraftDetails(tender: EmployeeTender) {
  const response = await apiRequest<ApiEnvelope<number>>("/maktender/saveTenderDraftDetails/", {
    method: "POST",
    body: JSON.stringify({
      tenderid: tender.tenderId,
      invitationid: tender.invitationId,
      acceptdate: tender.acceptDate || null,
      opendate: tender.openDate || null,
      description: tender.description,
      note: tender.note,
      createdby: tender.createdBy,
      criteria: tender.criteria.map(({ name, type, weight }) => ({ name, type, weight })),
      requirements: tender.requirements.map(({ name, type, documentRequired }) => ({ name, type, documentRequired })),
      members: tender.members.map(({ employeeId, name, position, role, email }) => ({ empid: employeeId, name, position, role, email })),
    }),
  })
  return unwrapRetData(response)
}

export async function uploadEmployeeTenderDocument(input: { file: File; tenderId: number; invitationId: number; createdBy: string; batchId?: number; documentTypeId?: number }) {
  const form = new FormData()
  form.append("file", input.file)
  form.append("tenderid", String(input.tenderId))
  form.append("invitationid", String(input.invitationId))
  form.append("createdby", input.createdBy)
  form.append("batchid", String(input.batchId ?? 0))
  form.append("doctypeid", String(input.documentTypeId ?? 9))
  return apiRequest<{ data: { documentid: number; filename: string } }>("/maktender/uploadTenderDocument/", { method: "POST", body: form })
}

export async function deleteEmployeeTenderDocument(documentId: number) {
  return apiRequest<{ data: Array<{ filepath?: string | null }> }>("/maktender/deleteFile/", {
    method: "POST",
    body: JSON.stringify({ sourceid: documentId, sourcetype: "TenderDoc" }),
  })
}

export async function publishEmployeeTenderToBackend(tender: EmployeeTender) {
  const response = await apiRequest<ApiEnvelope<number>>("/maktender/publishTenderFromPortal/", {
    method: "POST",
    body: JSON.stringify({
      tenderid: tender.tenderId,
      invitationid: tender.invitationId,
      acceptdate: tender.acceptDate,
      opendate: tender.openDate,
      publishdate: tender.publishDate || new Date().toISOString().slice(0, 10),
      description: tender.description || tender.name,
      createdby: tender.createdBy,
      criteria: tender.criteria.map(({ name, type, weight }) => ({ name, type, weight })),
      requirements: tender.requirements.map(({ name, type }) => ({ name, type })),
      members: tender.members.map(({ employeeId, name, position, role, email }) => ({ empid: employeeId, name, position, role, email })),
    }),
  })
  return unwrapRetData(response)
}

export type EvaluationVendor = {
  id: number
  vendorid: number
  vendorname?: string | null
  totalamount?: number | string | null
  countdoc?: number | null
  totalpoint?: number | string | null
  invitationid: number
  status?: number | null
  note?: string | null
  approvedamount?: number | string | null
  first_round_status?: number | null
  first_round_comment?: string | null
}

export type EvaluationCriterion = {
  criteriaid: number
  invitationid: number
  INVITATIONID?: number
  criterianame?: string | null
  criteriatypename?: string | null
  weight?: number | string | null
  vendorid?: number | null
  result?: number | string | null
  tenderstatus?: number | string | null
  createdby?: string | null
  created?: string | null
}

export async function fetchEvaluationTenders() {
  return fetchTenderCatalog("result")
}

export async function fetchEvaluationVendors(invitationId: number, employeeId: number) {
  const response = await apiRequest<ApiEnvelope<EvaluationVendor[]>>(
    `/maktender/getInvVendorList/?invitationid=${invitationId}&empid=${employeeId}`,
  )
  return unwrapRetData(response) ?? []
}

export async function fetchEvaluationCriteria(invitationId: number, vendorId: number, employeeId: number) {
  const response = await apiRequest<ApiEnvelope<EvaluationCriterion[]>>(
    `/maktender/getInvVendorListId/?invitationid=${invitationId}&vendorid=${vendorId}&empid=${employeeId}`,
  )
  return unwrapRetData(response) ?? []
}

export async function saveEvaluationScores(input: {
  invitationId: number
  vendorId: number
  employeeId: number
  createdBy: string
  scores: Array<{ criteriaId: number; result: number }>
}) {
  const response = await apiRequest<ApiEnvelope<unknown>>(
    "/maktender/evalueteInvitationOfVendor/",
    {
      method: "POST",
      body: JSON.stringify({
        empid: input.employeeId,
        createdby: input.createdBy,
        param: input.scores.map((score) => ({
          invitationid: input.invitationId,
          vendorid: input.vendorId,
          criteriaid: score.criteriaId,
          result: score.result,
        })),
      }),
    },
  )
  unwrapRetData(response)
}

export type EmployeeSettingAssignment = {
  id: number
  actionid: number
  actioncode?: string | null
  actionname?: string | null
  membertypeid: number
  membertypename?: string | null
  empid: number
  empname?: string | null
  email?: string | null
}

export type EmployeeSettingAction = {
  id: number
  actioncode?: string | null
  actionname?: string | null
}

export type EmployeeMemberType = {
  membertypeid: number
  membertypename?: string | null
}

export type EmployeeDirectoryItem = {
  id?: number
  empid: number
  empname?: string | null
  positionname?: string | null
  email?: string | null
}

export async function fetchEmployeeDirectory() {
  const response = await apiRequest<ApiEnvelope<EmployeeDirectoryItem[]>>("/employees/all/")
  return (unwrapRetData(response) ?? [])
    .filter((employee) => Number(employee.empid) > 0)
    .sort((left, right) => (left.empname ?? "").localeCompare(right.empname ?? "", "mn"))
}

export type EmployeePermission = {
  empid: number
  isClose: number
  isHold: number
  isReopen: number
  isCancel: number
  isJWAdmin: number
  isAdmin: number
}

export async function fetchEmployeeSettings() {
  const response = await apiRequest<ApiEnvelope<[
    EmployeeSettingAssignment[],
    EmployeeSettingAction[],
    EmployeeMemberType[],
    EmployeeDirectoryItem[],
  ]>>("/settings/getList/")
  const data = unwrapRetData(response) ?? [[], [], [], []]
  return {
    assignments: data[0] ?? [],
    actions: data[1] ?? [],
    memberTypes: data[2] ?? [],
    employees: data[3] ?? [],
  }
}

export async function fetchEmployeePermission(employeeId: number) {
  const response = await apiRequest<ApiEnvelope<EmployeePermission>>(
    `/settings/getPermission/${employeeId}/`,
  )
  return unwrapRetData(response)
}

export async function saveEmployeeSetting(input: {
  id?: number
  actionId: number
  memberTypeId: number
  employeeId: number
  currentUser: string
}) {
  const response = await apiRequest<ApiEnvelope<unknown>>("/settings/save/", {
    method: "POST",
    body: JSON.stringify([{
      id: input.id ?? -1,
      actionid: input.actionId,
      membertypeid: input.memberTypeId,
      empid: input.employeeId,
      currentuser: input.currentUser,
    }]),
  })
  unwrapRetData(response)
}

export async function deleteEmployeeSetting(settingId: number, currentUser: string) {
  const response = await apiRequest<ApiEnvelope<unknown>>(
    `/settings/delete/${settingId}/?currentuser=${encodeURIComponent(currentUser)}`,
    { method: "DELETE" },
  )
  unwrapRetData(response)
}
