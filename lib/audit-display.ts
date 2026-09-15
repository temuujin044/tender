const actionLabels: Record<string, string> = {
  save_settings_view: 'Тохиргоо хадгалсан',
  delete_setting_view: 'Тохиргоо устгасан',
  save_tender: 'Тендер хадгалсан',
  delete_tender: 'Тендер устгасан',
  save_tender_draft_details_view: 'Тендерийн дэлгэрэнгүйг зассан',
  publish_tender_from_portal_view: 'Тендер нийтэлсэн',
  save_invitation: 'Урилга хадгалсан',
  save_invitation_header: 'Урилгын мэдээлэл зассан',
  delay_invitation: 'Тендерийн хугацаа сунгасан',
  finish_invitation: 'Тендер дуусгасан',
  reject_invitation: 'Тендер цуцалсан',
  publish_request_inv: 'Нийтлэх хүсэлт илгээсэн',
  re_publish_request_inv: 'Дахин нийтлэх хүсэлт илгээсэн',
  re_publish_invitation: 'Урилга дахин нийтэлсэн',
  save_vendor_view: 'Нийлүүлэгчийн мэдээлэл зассан',
  save_qoute_view: 'Үнийн санал хадгалсан',
  delete_qoute_view: 'Үнийн санал устгасан',
  save_comment_view: 'Сэтгэгдэл илгээсэн',
  save_members_view: 'Хорооны бүрэлдэхүүн хадгалсан',
  delete_member_view: 'Хорооны гишүүн хассан',
  evaluete_invitation_of_vendor: 'Нийлүүлэгчийг үнэлсэн',
  final_evaluation_invitation_of_vendor: 'Эцсийн үнэлгээ хадгалсан',
  evaluate_invitation_first_round_view: 'Эхний шатны үнэлгээ хадгалсан',
  open_invitation_of_vendor: 'Нийлүүлэгчийн санал нээсэн',
  tender_open_log_view: 'Тендер нээсэн',
  upload_tender_document_view: 'Тендерийн баримт байршуулсан',
  upload_tender_join_document_view: 'Оролцох баримт байршуулсан',
  save_vendor_company_doc_view: 'Компанийн баримт хадгалсан',
  delete_file_view: 'Файл устгасан',
  send_email_view: 'Имэйл илгээсэн',
};

export function auditActionLabel(action: string) {
  return actionLabels[action] ?? action;
}

export const auditFieldLabels: Record<string, string> = {
  id: 'Бүртгэлийн ID',
  tenderid: 'Тендерийн ID',
  invitationid: 'Урилгын ID',
  vendorid: 'Нийлүүлэгчийн ID',
  empid: 'Ажилтны ID',
  actionid: 'Үйлдлийн төрөл',
  membertypeid: 'Гишүүний эрх',
  tendername: 'Тендерийн нэр',
  vendorname: 'Нийлүүлэгч',
  empname: 'Ажилтны нэр',
  created: 'Үүсгэсэн огноо',
  updated: 'Зассан огноо',
  createdby: 'Бүртгэсэн нэр',
  status: 'Төлөв',
  acceptdate: 'Хүлээн авах хугацаа',
  opendate: 'Нээх хугацаа',
  startdate: 'Эхлэх хугацаа',
  enddate: 'Дуусах хугацаа',
  budget: 'Төсөв',
  qouteamount: 'Саналын дүн',
  score: 'Оноо',
  roleid: 'Эрх',
};

export function auditTime(value: string) {
  return new Intl.DateTimeFormat('mn-MN', {
    timeZone: 'Asia/Ulaanbaatar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function auditValue(value: unknown) {
  if (value === null || value === undefined) return '—';
  if (value === '[REDACTED]') return 'Нууцалсан';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
