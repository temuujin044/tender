'use client';

export type EmployeeTenderStatus = 'draft' | 'ready' | 'published' | 'closed';

export type EmployeeBatch = { id: string; code: string; name: string };
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
  tenderCode: string;
  invitationCode: string;
  name: string;
  tenderType: string;
  purchaseType: string;
  department: string;
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
  const checks = [
    Boolean(
      tender.name && tender.tenderType && tender.purchaseType && tender.department && tender.budget
    ),
    Boolean(
      tender.startDate &&
      tender.endDate &&
      tender.acceptDate &&
      tender.openDate &&
      tender.evaluationDate
    ),
    tender.batches.length > 0,
    tender.requirements.length > 0 &&
      tender.criteria.length > 0 &&
      tender.criteria.reduce((sum, item) => sum + item.weight, 0) === 100,
    tender.documents.length > 0,
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
