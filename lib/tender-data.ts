export type TenderStatus = "open" | "closing-soon" | "upcoming" | "closed" | "awarded"

export type TenderDocument = {
  name: string
  size: string
  type: string
  category: "tender" | "template" | "contract"
}

export type TenderRequirement = {
  id: number
  name: string
  type: "required" | "technical" | "financial"
  documentRequired?: boolean
}

export type TenderBatch = { id: number; code: string; name: string }

export interface Tender {
  id: string
  tenderId: number
  invitationId: number
  invitationCode: string
  title: string
  description: string
  category: string
  purchaseType: string
  publishDate: string
  startDate: string
  deadline: string
  openDate: string
  status: TenderStatus
  value: string
  department: string
  documents: TenderDocument[]
  requirements: TenderRequirement[]
  batches: TenderBatch[]
  timeline: { event: string; date: string; complete?: boolean }[]
}

export const tenders: Tender[] = [
  {
    id: "МАК-2026-018",
    tenderId: 118,
    invitationId: 3018,
    invitationCode: "УТ-3018",
    title: "Уулын хүнд даацын автомашины дугуй нийлүүлэх",
    description: "Уурхайн тасралтгүй ажиллагаанд зориулсан хүнд даацын автомашины дугуйг техникийн шаардлагын дагуу нийлүүлнэ. Нийлүүлэлт, баталгаат хугацаа болон борлуулалтын дараах үйлчилгээг багтаасан санал ирүүлнэ.",
    category: "Бараа нийлүүлэлт",
    purchaseType: "Нээлттэй тендер",
    publishDate: "2026.08.04",
    startDate: "2026.08.04",
    deadline: "2026.08.21 17:00",
    openDate: "2026.08.22 10:00",
    status: "open",
    value: "₮1,850,000,000",
    department: "Хангамжийн газар",
    documents: [
      { name: "Техникийн тодорхойлолт.pdf", size: "2.8 MB", type: "pdf", category: "tender" },
      { name: "Үнийн саналын маягт.xlsx", size: "184 KB", type: "xlsx", category: "template" },
      { name: "Гэрээний төсөл.pdf", size: "1.1 MB", type: "pdf", category: "contract" },
    ],
    requirements: [
      { id: 1, name: "Улсын бүртгэлийн гэрчилгээ", type: "required", documentRequired: true },
      { id: 2, name: "Ижил төрлийн нийлүүлэлтийн 3-аас доошгүй жилийн туршлага", type: "technical", documentRequired: true },
      { id: 3, name: "Үйлдвэрлэгчийн баталгаат хугацаа 24 сараас багагүй байх", type: "technical" },
      { id: 4, name: "Үнийн саналын маягтыг бүрэн бөглөх", type: "financial", documentRequired: true },
    ],
    batches: [
      { id: 1801, code: "БАГЦ-01", name: "27.00R49 хэмжээтэй дугуй" },
      { id: 1802, code: "БАГЦ-02", name: "33.00R51 хэмжээтэй дугуй" },
    ],
    timeline: [
      { event: "Тендер нийтэлсэн", date: "2026.08.04", complete: true },
      { event: "Санал хүлээн авах эцсийн хугацаа", date: "2026.08.21 17:00" },
      { event: "Санал нээх", date: "2026.08.22 10:00" },
      { event: "Үнэлгээ, шалгаруулалт", date: "2026.08.24–2026.09.04" },
    ],
  },
  {
    id: "МАК-2026-019",
    tenderId: 119,
    invitationId: 3019,
    invitationCode: "УТ-3019",
    title: "Төв оффисын сүлжээний тоног төхөөрөмж шинэчлэх",
    description: "Core switch, access switch, firewall болон дагалдах лиценз, суурилуулалт, тохиргооны иж бүрэн ажил.",
    category: "Мэдээллийн технологи",
    purchaseType: "Үнийн санал авах",
    publishDate: "2026.08.07",
    startDate: "2026.08.07",
    deadline: "2026.08.14 15:00",
    openDate: "2026.08.14 16:00",
    status: "closing-soon",
    value: "₮420,000,000",
    department: "Мэдээллийн технологийн газар",
    documents: [
      { name: "Сүлжээний архитектур.pdf", size: "4.2 MB", type: "pdf", category: "tender" },
      { name: "Тоног төхөөрөмжийн жагсаалт.xlsx", size: "98 KB", type: "xlsx", category: "template" },
    ],
    requirements: [
      { id: 5, name: "Үйлдвэрлэгчийн албан ёсны түншийн гэрчилгээ", type: "required", documentRequired: true },
      { id: 6, name: "Инженерүүдийн мэргэжлийн сертификат", type: "technical", documentRequired: true },
      { id: 7, name: "3 жилийн техник дэмжлэгийн нөхцөл", type: "technical" },
    ],
    batches: [{ id: 1901, code: "БАГЦ-01", name: "Сүлжээний тоног төхөөрөмж, үйлчилгээ" }],
    timeline: [
      { event: "Тендер нийтэлсэн", date: "2026.08.07", complete: true },
      { event: "Тодруулга авах сүүлийн өдөр", date: "2026.08.12", complete: true },
      { event: "Санал хүлээн авах эцсийн хугацаа", date: "2026.08.14 15:00" },
      { event: "Санал нээх", date: "2026.08.14 16:00" },
    ],
  },
  {
    id: "МАК-2026-020",
    tenderId: 120,
    invitationId: 3020,
    invitationCode: "УТ-3020",
    title: "Уурхайн ажилчдын өвлийн хамгаалах хувцас",
    description: "Өвлийн ажлын хувцас, хамгаалалтын гутал, дулаан хэрэгслийг багцаар нийлүүлнэ.",
    category: "Хангамж",
    purchaseType: "Нээлттэй тендер",
    publishDate: "2026.08.18",
    startDate: "2026.08.18",
    deadline: "2026.09.02 17:00",
    openDate: "2026.09.03 10:00",
    status: "upcoming",
    value: "₮680,000,000",
    department: "Хүний нөөц, захиргааны газар",
    documents: [{ name: "Урьдчилсан шаардлага.pdf", size: "740 KB", type: "pdf", category: "tender" }],
    requirements: [
      { id: 8, name: "Хөдөлмөр хамгааллын стандартын гэрчилгээ", type: "required", documentRequired: true },
      { id: 9, name: "Бүтээгдэхүүний дээж ирүүлэх", type: "technical" },
    ],
    batches: [
      { id: 2001, code: "БАГЦ-01", name: "Өвлийн ажлын хувцас" },
      { id: 2002, code: "БАГЦ-02", name: "Хамгаалалтын гутал" },
    ],
    timeline: [
      { event: "Тендер нийтлэх", date: "2026.08.18" },
      { event: "Санал хүлээн авах эцсийн хугацаа", date: "2026.09.02 17:00" },
      { event: "Санал нээх", date: "2026.09.03 10:00" },
    ],
  },
  {
    id: "МАК-2026-011",
    tenderId: 111,
    invitationId: 3011,
    invitationCode: "УТ-3011",
    title: "Нарийн сухайтын кемпийн катерингийн үйлчилгээ",
    description: "Кемпийн ажилтнуудад жилийн турш катерингийн цогц үйлчилгээ үзүүлэх сонгон шалгаруулалт.",
    category: "Үйлчилгээ",
    purchaseType: "Нээлттэй тендер",
    publishDate: "2026.06.10",
    startDate: "2026.06.10",
    deadline: "2026.06.30 17:00",
    openDate: "2026.07.01 10:00",
    status: "closed",
    value: "₮3,200,000,000",
    department: "Үйл ажиллагааны газар",
    documents: [
      { name: "Үйлчилгээний ажлын даалгавар.pdf", size: "3.5 MB", type: "pdf", category: "tender" },
      { name: "Гэрээний нөхцөл.pdf", size: "1.8 MB", type: "pdf", category: "contract" },
    ],
    requirements: [
      { id: 10, name: "Хүнсний үйлдвэрлэлийн тусгай зөвшөөрөл", type: "required", documentRequired: true },
      { id: 11, name: "Уурхайн кемпийн үйлчилгээний туршлага", type: "technical", documentRequired: true },
    ],
    batches: [{ id: 1101, code: "БАГЦ-01", name: "Катерингийн иж бүрэн үйлчилгээ" }],
    timeline: [
      { event: "Тендер нийтэлсэн", date: "2026.06.10", complete: true },
      { event: "Санал хүлээн авсан", date: "2026.06.30 17:00", complete: true },
      { event: "Үнэлгээ хийж байна", date: "2026.07.01–2026.07.15", complete: true },
    ],
  },
  {
    id: "МАК-2026-006",
    tenderId: 106,
    invitationId: 3006,
    invitationCode: "УТ-3006",
    title: "Цементийн үйлдвэрийн лабораторийн тоног төхөөрөмж",
    description: "Чанарын лабораторийн хэмжилт, шинжилгээний тоног төхөөрөмж нийлүүлэх тендер.",
    category: "Тоног төхөөрөмж",
    purchaseType: "Нээлттэй тендер",
    publishDate: "2026.04.14",
    startDate: "2026.04.14",
    deadline: "2026.05.05 17:00",
    openDate: "2026.05.06 10:00",
    status: "awarded",
    value: "₮960,000,000",
    department: "Технологи, чанарын газар",
    documents: [{ name: "Лабораторийн тоног төхөөрөмж.pdf", size: "2.1 MB", type: "pdf", category: "tender" }],
    requirements: [
      { id: 12, name: "Тоног төхөөрөмжийн гарал үүслийн гэрчилгээ", type: "required", documentRequired: true },
      { id: 13, name: "Суурилуулалт, сургалтын төлөвлөгөө", type: "technical", documentRequired: true },
    ],
    batches: [{ id: 601, code: "БАГЦ-01", name: "Лабораторийн тоног төхөөрөмж" }],
    timeline: [
      { event: "Тендер нийтэлсэн", date: "2026.04.14", complete: true },
      { event: "Санал нээсэн", date: "2026.05.06", complete: true },
      { event: "Шалгарсан нийлүүлэгчийг мэдэгдсэн", date: "2026.05.20", complete: true },
    ],
  },
]

export const statusConfig: Record<TenderStatus, { label: string; className: string }> = {
  open: { label: "Санал авч байна", className: "bg-emerald-100 text-emerald-700" },
  "closing-soon": { label: "Удахгүй хаагдана", className: "bg-amber-100 text-amber-700" },
  upcoming: { label: "Тун удахгүй", className: "bg-blue-100 text-blue-700" },
  closed: { label: "Үнэлгээ хийгдэж байна", className: "bg-slate-100 text-slate-700" },
  awarded: { label: "Шалгаруулалт дууссан", className: "bg-violet-100 text-violet-700" },
}

export const categories = ["Бүх ангилал", ...Array.from(new Set(tenders.map((tender) => tender.category)))]

export function isPublicTenderStatus(status: TenderStatus) {
  return status === "open" || status === "closing-soon"
}

export function getTenderById(id: string) {
  return tenders.find((tender) => tender.id === id)
}
