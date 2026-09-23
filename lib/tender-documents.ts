export const standardVendorDocuments = [
  {
    id: 1001,
    name: 'Улсын бүртгэлийн гэрчилгээ',
    description: 'Хуулийн этгээдийн хүчинтэй гэрчилгээний хуулбар.',
  },
  {
    id: 1002,
    name: 'Татварын өргүй тодорхойлолт',
    description: 'Тендер зарласан хугацаанд хүчинтэй тодорхойлолт.',
  },
  {
    id: 1003,
    name: 'Нийгмийн даатгалын шимтгэлийн тайлан',
    description: 'Сүүлийн тайлант хугацааны баталгаажсан тайлан.',
  },
  {
    id: 1004,
    name: 'Сүүлийн жилийн санхүүгийн тайлан',
    description: 'Баталгаажсан жилийн эцсийн санхүүгийн тайлан.',
  },
] as const;

export function vendorDocumentLabel(requirementTypeId: number | null | undefined) {
  return (
    standardVendorDocuments.find((document) => document.id === Number(requirementTypeId))?.name ??
    'Нэмэлт баримт бичиг'
  );
}
