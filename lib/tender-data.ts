export type TenderStatus = 'open' | 'closing-soon' | 'upcoming' | 'closed' | 'awarded';

export type TenderDocument = {
  name: string;
  size: string;
  type: string;
  category: 'tender' | 'template' | 'contract';
  sourceId?: number;
  sourceType?: string;
  filePath?: string;
};

export type TenderRequirement = {
  id: number;
  name: string;
  type: 'required' | 'technical' | 'financial';
  documentRequired?: boolean;
};

export type TenderBatch = { id: number; code: string; name: string };

export interface Tender {
  id: string;
  tenderCode?: string;
  tenderId: number;
  invitationId: number;
  invitationStatusId?: number;
  invitationCode: string;
  title: string;
  description: string;
  category: string;
  purchaseType: string;
  publishDate: string;
  startDate: string;
  deadline: string;
  openDate: string;
  status: TenderStatus;
  value: string;
  department: string;
  activityIds: number[];
  activities: string[];
  documents: TenderDocument[];
  requirements: TenderRequirement[];
  batches: TenderBatch[];
  timeline: { event: string; date: string; complete?: boolean }[];
}

export const statusConfig: Record<TenderStatus, { label: string; className: string }> = {
  open: { label: 'Санал авч байна', className: 'bg-emerald-100 text-emerald-700' },
  'closing-soon': { label: 'Удахгүй хаагдана', className: 'bg-amber-100 text-amber-700' },
  upcoming: { label: 'Тун удахгүй', className: 'bg-blue-100 text-blue-700' },
  closed: { label: 'Үнэлгээ хийгдэж байна', className: 'bg-slate-100 text-slate-700' },
  awarded: { label: 'Шалгаруулалт дууссан', className: 'bg-violet-100 text-violet-700' },
};

export function isPublicTenderStatus(status: TenderStatus) {
  return status === 'open' || status === 'closing-soon';
}
