'use client';

export type EmployeeTenderStatus = 'draft' | 'ready' | 'published' | 'closed';

export const invitationStatusLabels: Record<number, string> = {
  0: 'Ноорог',
  6: 'Нийтлэх зөвшөөрөл хүлээж байгаа',
  1: 'Нийтэлсэн',
  3: 'Үнэлгээ хийж байгаа',
  7: 'Үр дүн нийтэлсэн',
  8: 'Цуцалсан',
  9: 'Дахин зарлах зөвшөөрөл хүлээж байгаа',
  10: 'Дахин зарласан',
};

export type EmployeeBatch = { id: string; code: string; name: string; budget: number };
export type EmployeeRequirement = {
  id: string;
  name: string;
  type: 'general' | 'technical' | 'financial';
  documentRequired: boolean;
};
export type EmployeeCriterion = {
  id: string;
  name: string;
  type: 'technical' | 'financial' | 'experience';
  weight: number;
};
export type EmployeeDocument = {
  id: string;
  name: string;
  type: 'tender' | 'template' | 'contract';
  size: string;
  file?: File;
};
export type EmployeeMember = {
  id: string;
  employeeId: number;
  name: string;
  position: string;
  role: 'secretary' | 'chair' | 'member' | 'internal-control';
  email: string;
};

export type EmployeeTender = {
  id: string;
  tenderId: number;
  invitationId: number;
  invitationStatusId?: number;
  tenderCode: string;
  invitationCode: string;
  name: string;
  tenderType: string;
  purchaseType: string;
  department: string;
  activityIds: number[];
  budget: number;
  publishDate: string;
  startDate: string;
  endDate: string;
  acceptDate: string;
  openDate: string;
  evaluationDate: string;
  description: string;
  note: string;
  status: EmployeeTenderStatus;
  batches: EmployeeBatch[];
  requirements: EmployeeRequirement[];
  criteria: EmployeeCriterion[];
  documents: EmployeeDocument[];
  members: EmployeeMember[];
  createdBy: string;
  updatedAt: string;
};

export function getTenderCompletion(tender: EmployeeTender) {
  const batchBudgetTotal = tender.batches.reduce((sum, batch) => sum + batch.budget, 0);
  const checks = [
    Boolean(
      tender.name &&
      tender.tenderType &&
      tender.purchaseType &&
      tender.department &&
      tender.activityIds.length > 0 &&
      tender.budget
    ),
    Boolean(
      tender.startDate &&
      tender.endDate &&
      tender.acceptDate &&
      tender.openDate &&
      tender.evaluationDate
    ),
    tender.batches.length > 0 &&
      tender.batches.every((batch) => batch.budget > 0) &&
      batchBudgetTotal === tender.budget,
    tender.requirements.length > 0 &&
      tender.criteria.length > 0 &&
      tender.criteria.reduce((sum, item) => sum + item.weight, 0) === 100,
    ['secretary', 'chair', 'internal-control'].every((role) =>
      tender.members.some((member) => member.role === role)
    ),
  ];
  const completed = checks.filter(Boolean).length;
  return {
    completed,
    total: checks.length,
    percent: Math.round((completed / checks.length) * 100),
    checks,
  };
}

export function formatEmployeeMoney(value: number) {
  return `${new Intl.NumberFormat('mn-MN', { maximumFractionDigits: 0 }).format(value)} ₮`;
}
