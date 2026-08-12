"use client"

export type SubmissionStatus = "submitted" | "under-review" | "awarded" | "not-awarded"

export type DummySubmission = {
  id: string
  tenderId: string
  invitationId: number
  batchId: number
  batchName: string
  quoteDate: string
  quoteAmount: number
  deliveryDate: string
  deliveryDays: number
  note: string
  files: string[]
  submittedAt: string
  status: SubmissionStatus
}

export type DummyComment = {
  id: string
  tenderId: string
  title: string
  message: string
  author: "vendor" | "buyer"
  createdAt: string
}

const SUBMISSIONS_KEY = "mak_tender_dummy_submissions"
const PARTICIPATIONS_KEY = "mak_tender_dummy_participations"
const COMMENTS_KEY = "mak_tender_dummy_comments"
export const DUMMY_STORE_EVENT = "mak-tender-dummy-store-change"

const initialSubmissions: DummySubmission[] = [
  {
    id: "QUOTE-1001", tenderId: "МАК-2026-011", invitationId: 3011, batchId: 1101,
    batchName: "Катерингийн иж бүрэн үйлчилгээ", quoteDate: "2026-06-25",
    quoteAmount: 2980000000, deliveryDate: "2026-08-01", deliveryDays: 365,
    note: "Үйлчилгээний шилжилтийн 14 хоногийн төлөвлөгөө багтсан.",
    files: ["Техникийн санал.pdf", "Үнийн санал.xlsx"],
    submittedAt: "2026-06-25T11:30:00.000Z", status: "under-review",
  },
  {
    id: "QUOTE-1002", tenderId: "МАК-2026-006", invitationId: 3006, batchId: 601,
    batchName: "Лабораторийн тоног төхөөрөмж", quoteDate: "2026-05-02",
    quoteAmount: 915000000, deliveryDate: "2026-07-15", deliveryDays: 60,
    note: "Суурилуулалт болон 2 өдрийн сургалт багтсан.",
    files: ["Санал.pdf", "Үйлдвэрлэгчийн гэрчилгээ.pdf"],
    submittedAt: "2026-05-02T07:20:00.000Z", status: "awarded",
  },
]

const initialComments: DummyComment[] = [
  {
    id: "COMMENT-1", tenderId: "МАК-2026-018", title: "Баталгаат хугацааны тухай",
    message: "Баталгаат хугацаа нь хүлээлгэн өгсөн өдрөөс эхэлж тооцогдоно.",
    author: "buyer", createdAt: "2026-08-09T03:15:00.000Z",
  },
]

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  const value = window.localStorage.getItem(key)
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

function write<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new Event(DUMMY_STORE_EVENT))
}

export function getDummySubmissions() {
  return read<DummySubmission[]>(SUBMISSIONS_KEY, initialSubmissions)
}

export function saveDummySubmission(submission: Omit<DummySubmission, "id" | "submittedAt" | "status">) {
  const submissions = getDummySubmissions()
  const index = submissions.findIndex((item) => item.tenderId === submission.tenderId && item.batchId === submission.batchId)
  const next: DummySubmission = {
    ...submission,
    id: index >= 0 ? submissions[index].id : `QUOTE-${Date.now()}`,
    submittedAt: new Date().toISOString(),
    status: "submitted",
  }
  if (index >= 0) submissions[index] = next
  else submissions.unshift(next)
  write(SUBMISSIONS_KEY, submissions)
  setDummyParticipation(submission.tenderId)
  return next
}

export function getDummyParticipations() {
  return read<string[]>(PARTICIPATIONS_KEY, ["МАК-2026-011", "МАК-2026-006"])
}

export function setDummyParticipation(tenderId: string) {
  const current = getDummyParticipations()
  if (!current.includes(tenderId)) write(PARTICIPATIONS_KEY, [...current, tenderId])
}

export function getDummyComments(tenderId: string) {
  return read<DummyComment[]>(COMMENTS_KEY, initialComments).filter((comment) => comment.tenderId === tenderId)
}

export function addDummyComment(tenderId: string, title: string, message: string) {
  const comments = read<DummyComment[]>(COMMENTS_KEY, initialComments)
  const comment: DummyComment = {
    id: `COMMENT-${Date.now()}`, tenderId, title, message, author: "vendor", createdAt: new Date().toISOString(),
  }
  write(COMMENTS_KEY, [...comments, comment])
  return comment
}

export function formatMoney(value: number) {
  return `${new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 0 }).format(value)} ₮`
}
