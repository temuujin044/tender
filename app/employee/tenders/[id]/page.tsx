'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Layers3,
  Loader2,
  Plus,
  Save,
  Send,
  Settings2,
  Trash2,
  Upload,
  UsersRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { cn } from '@/lib/utils';
import {
  formatEmployeeMoney,
  invitationStatusLabels,
  getTenderCompletion,
  type EmployeeCriterion,
  type EmployeeMember,
  type EmployeeRequirement,
  type EmployeeTender,
} from '@/lib/employee-tender';
import {
  deleteEmployeeTenderDocument,
  fetchEmployeeDirectory,
  fetchEmployeeTender,
  fetchEmployeeTenderOptions,
  fetchMyEmployeePermission,
  saveEmployeeTenderToBackend,
  saveEmployeeTenderCommittee,
  uploadEmployeeTenderDocument,
  type EmployeeDirectoryItem,
  type EmployeePermission,
  type EmployeeTenderOptions,
} from '@/lib/api';
import { getStoredUser } from '@/lib/auth';
import { standardVendorDocuments } from '@/lib/tender-documents';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { TenderWorkflowPanel } from '@/components/employee/tender-workflow';

const steps = [
  { id: 1, label: 'Үндсэн мэдээлэл', icon: Settings2 },
  { id: 2, label: 'Урилга, хугацаа', icon: CalendarClock },
  { id: 3, label: 'Багц', icon: Layers3 },
  { id: 4, label: 'Баримт бичиг', icon: ClipboardCheck },
  { id: 5, label: 'Үнэлгээний хороо', icon: UsersRound },
  { id: 6, label: 'Хянаж нийтлэх', icon: Send },
];

const roleNames: Record<EmployeeMember['role'], string> = {
  secretary: 'Нарийн бичиг',
  chair: 'Дарга',
  member: 'Гишүүн',
  'internal-control': 'Дотоод хяналт',
};
const requirementNames: Record<EmployeeRequirement['type'], string> = {
  general: 'Ерөнхий',
  technical: 'Техникийн',
  financial: 'Санхүүгийн',
};
const criterionNames: Record<EmployeeCriterion['type'], string> = {
  technical: 'Техникийн',
  financial: 'Санхүүгийн',
  experience: 'Туршлага',
};

function hasDraftContent(tender: EmployeeTender) {
  return Boolean(
    tender.name.trim() ||
    tender.tenderType ||
    tender.purchaseType ||
    tender.department ||
    tender.activityIds.length ||
    tender.budget ||
    tender.startDate ||
    tender.endDate ||
    tender.acceptDate ||
    tender.openDate ||
    tender.evaluationDate ||
    tender.description.trim() ||
    tender.batches.length ||
    tender.requirements.length ||
    tender.criteria.length ||
    tender.documents.length ||
    tender.members.length
  );
}

export default function EmployeeTenderEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tender, setTender] = useState<EmployeeTender | null>(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editable, setEditable] = useState(id === '0');
  const workflowChanged = useCallback((canEdit: boolean, statusId?: number) => {
    setEditable(canEdit);
    if (statusId !== undefined)
      setTender((current) =>
        current
          ? {
              ...current,
              invitationStatusId: statusId,
              status:
                statusId === 0
                  ? 'draft'
                  : statusId === 6
                    ? 'ready'
                    : statusId === 1
                      ? 'published'
                      : 'closed',
            }
          : current
      );
  }, []);
  const [loadError, setLoadError] = useState('');
  const [options, setOptions] = useState<EmployeeTenderOptions>({
    tenderTypes: [],
    purchaseTypes: [],
    departments: [],
    activities: [],
  });
  const [employees, setEmployees] = useState<EmployeeDirectoryItem[]>([]);
  const [permission, setPermission] = useState<EmployeePermission | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [batchDraft, setBatchDraft] = useState({ code: '', name: '', budget: '' });
  const [requirementDraft, setRequirementDraft] = useState<{
    name: string;
    type: EmployeeRequirement['type'];
    documentRequired: boolean;
  }>({ name: '', type: 'general', documentRequired: false });
  const [criterionDraft, setCriterionDraft] = useState<{
    name: string;
    type: EmployeeCriterion['type'];
    weight: string;
  }>({ name: '', type: 'technical', weight: '' });
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [memberDraft, setMemberDraft] = useState({
    employeeId: '',
    role: 'member' as EmployeeMember['role'],
  });
  const unsavedChanges = useUnsavedChanges(
    Boolean(
      batchDraft.code ||
      batchDraft.name ||
      batchDraft.budget ||
      requirementDraft.name ||
      criterionDraft.name ||
      criterionDraft.weight ||
      memberDraft.employeeId
    )
  );

  useEffect(() => {
    const invitationId = Number(id);
    void Promise.all([
      fetchEmployeeTenderOptions(),
      fetchEmployeeDirectory(),
      fetchMyEmployeePermission(),
    ])
      .then(([tenderOptions, employeeRows, currentPermission]) => {
        setOptions(tenderOptions);
        setEmployees(employeeRows);
        setPermission(currentPermission);
      })
      .catch((requestError) =>
        setLoadError(
          requestError instanceof Error ? requestError.message : 'Лавлах мэдээлэл ачаалж чадсангүй.'
        )
      );
    if (invitationId === 0) {
      const user = getStoredUser();
      const now = new Date();
      setTender({
        id: '0',
        tenderId: 0,
        invitationId: 0,
        tenderCode: 'Систем үүсгэнэ',
        invitationCode: 'Систем үүсгэнэ',
        name: '',
        tenderType: '',
        purchaseType: '',
        department: '',
        activityIds: [],
        budget: 0,
        publishDate: now.toISOString().slice(0, 10),
        startDate: '',
        endDate: '',
        acceptDate: '',
        openDate: '',
        evaluationDate: '',
        description: '',
        note: '',
        status: 'draft',
        batches: [],
        requirements: [],
        criteria: [],
        documents: [],
        members: [],
        createdBy: user?.username ?? '',
        updatedAt: now.toISOString(),
      });
      return;
    }
    void fetchEmployeeTender(invitationId)
      .then(setTender)
      .catch((requestError) =>
        setLoadError(
          requestError instanceof Error ? requestError.message : 'Тендер ачаалж чадсангүй.'
        )
      );
  }, [id]);
  const completion = useMemo(() => (tender ? getTenderCompletion(tender) : null), [tender]);
  const canManageTender = Boolean(permission?.isAdmin || permission?.isTenderManage);
  const canManageCommittee = Boolean(permission?.isAdmin || permission?.isCommitteeManage);
  const canEditCurrentSection = editable && (step === 5 ? canManageCommittee : canManageTender);
  const criteriaWeight = tender?.criteria.reduce((sum, item) => sum + item.weight, 0) ?? 0;
  const batchBudgetTotal = tender?.batches.reduce((sum, item) => sum + item.budget, 0) ?? 0;
  const showDocumentSection = Boolean(
    requirementDraft.documentRequired ||
    tender?.requirements.some((item) => item.documentRequired) ||
    tender?.documents.length
  );
  const committeeEmployees = useMemo(() => {
    const normalized = employeeQuery.trim().toLowerCase();
    if (!normalized) return employees.slice(0, 50);
    return employees
      .filter((employee) =>
        `${employee.empname ?? ''} ${employee.positionname ?? ''} ${employee.email ?? ''} ${employee.empid}`
          .toLowerCase()
          .includes(normalized)
      )
      .slice(0, 100);
  }, [employeeQuery, employees]);

  if (tender === null) {
    if (loadError)
      return (
        <div className="flex min-h-[70vh] items-center justify-center px-6 text-center text-sm font-medium text-red-700">
          {loadError}
        </div>
      );
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const update = <K extends keyof EmployeeTender>(key: K, value: EmployeeTender[K]) => {
    unsavedChanges.current = true;
    setTender((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSaved(false);
  };

  const validateCurrentStep = () => {
    const next: Record<string, string> = {};
    if (step === 1) {
      if (!tender.name.trim()) next.name = 'Тендерийн нэр шаардлагатай.';
      if (!tender.tenderType) next.tenderType = 'Тендерийн төрлийг сонгоно уу.';
      if (!tender.purchaseType) next.purchaseType = 'Худалдан авалтын төрлийг сонгоно уу.';
      if (!tender.department) next.department = 'Хариуцсан нэгжийг сонгоно уу.';
      if (!tender.activityIds.length) next.activityIds = 'Үйл ажиллагааны чиглэлийг сонгоно уу.';
      if (!tender.budget) next.budget = 'Төсөвт өртгийг оруулна уу.';
    }
    if (step === 2) {
      for (const key of [
        'startDate',
        'endDate',
        'acceptDate',
        'openDate',
        'evaluationDate',
      ] as const)
        if (!tender[key]) next[key] = 'Огноо шаардлагатай.';
      if (tender.acceptDate && tender.openDate && tender.acceptDate >= tender.openDate)
        next.openDate = 'Нээх хугацаа санал хүлээн авах хугацаанаас хойш байна.';
    }
    if (step === 3) {
      if (tender.batches.length === 0) next.batches = 'Багадаа нэг багц нэмнэ үү.';
      else if (tender.batches.some((batch) => !Number.isFinite(batch.budget) || batch.budget <= 0))
        next.batches = 'Багц бүрийн төсөвт үнийг 0-ээс их дүнгээр оруулна уу.';
      else if (batchBudgetTotal !== tender.budget)
        next.batches = `Багцын нийт төсөв (${formatEmployeeMoney(batchBudgetTotal)}) тендерийн нийт төсөвтэй (${formatEmployeeMoney(tender.budget)}) тэнцүү байх ёстой.`;
    }
    if (step === 4) {
      if (!tender.requirements.length) next.requirements = 'Багадаа нэг шаардлага нэмнэ үү.';
      if (!tender.criteria.length) next.criteria = 'Багадаа нэг шалгуур нэмнэ үү.';
      else if (criteriaWeight !== 100)
        next.criteria = `Шалгуурын нийт жин 100% байх ёстой. Одоогоор ${criteriaWeight}%.`;
    }
    if (step === 5) {
      for (const role of ['secretary', 'chair', 'internal-control'] as const)
        if (!tender.members.some((member) => member.role === role))
          next.members = 'Нарийн бичиг, Дарга, Дотоод хяналтын гишүүд заавал байна.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveDraft = async (quiet = false) => {
    if (!editable) return null;
    if (step === 5 && canManageCommittee && !canManageTender) {
      if (!tender.invitationId) {
        setLoadError('Хороо бүрдүүлэхийн өмнө тендерийн ноорог үүссэн байх шаардлагатай.');
        return null;
      }
      setSaving(true);
      setLoadError('');
      try {
        await saveEmployeeTenderCommittee(tender.invitationId, tender.members);
        const updated = { ...tender, updatedAt: new Date().toISOString() };
        setTender(updated);
        unsavedChanges.current = false;
        setSaved(true);
        if (!quiet) window.setTimeout(() => setSaved(false), 2200);
        return updated;
      } catch (requestError) {
        setLoadError(
          requestError instanceof Error
            ? requestError.message
            : 'Үнэлгээний хороог хадгалж чадсангүй.'
        );
        return null;
      } finally {
        setSaving(false);
      }
    }
    if (!canManageTender) return null;
    if (tender.tenderId === 0 && !hasDraftContent(tender)) {
      setLoadError('Ноорог үүсгэхийн тулд багадаа нэг талбарт мэдээлэл оруулна уу.');
      return null;
    }
    setSaving(true);
    setLoadError('');
    try {
      const currentCompletion = getTenderCompletion(tender);
      const nextStatus: EmployeeTender['status'] =
        tender.status === 'published' || tender.status === 'closed'
          ? tender.status
          : currentCompletion.percent === 100
            ? 'ready'
            : 'draft';
      const invitation = await saveEmployeeTenderToBackend({ ...tender, status: nextStatus });
      const tenderId = invitation.tenderid;
      const draftTender = {
        ...tender,
        tenderId,
        invitationId: invitation.invitationid,
        requirements: invitation.requirements,
        status: nextStatus,
      };
      let documents = tender.documents;
      for (const document of tender.documents.filter((item) => item.file)) {
        const uploaded = await uploadEmployeeTenderDocument({
          file: document.file!,
          tenderId,
          invitationId: invitation.invitationid,
          createdBy: tender.createdBy,
        });
        documents = documents.map((item) =>
          item.id === document.id
            ? { ...item, id: String(uploaded.data.documentid), file: undefined }
            : item
        );
      }
      const result = {
        ...draftTender,
        id: String(invitation.invitationid),
        invitationCode: invitation.invitationcode || tender.invitationCode,
        documents,
        updatedAt: new Date().toISOString(),
      };
      setTender(result);
      unsavedChanges.current = false;
      setSaving(false);
      setSaved(true);
      if (id === '0') router.replace(`/employee/tenders/${invitation.invitationid}`);
      if (!quiet) window.setTimeout(() => setSaved(false), 2200);
      return result;
    } catch (requestError) {
      setSaving(false);
      setLoadError(
        requestError instanceof Error ? requestError.message : 'Тендер хадгалагдсангүй.'
      );
      return null;
    }
  };

  const goNext = async () => {
    if (!validateCurrentStep()) return;
    const savedTender = await saveDraft(true);
    if (!savedTender) return;
    setStep((current) => Math.min(current + 1, 6));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const addBatch = () => {
    const budget = Number(batchDraft.budget);
    if (
      !batchDraft.code.trim() ||
      !batchDraft.name.trim() ||
      !Number.isFinite(budget) ||
      budget <= 0
    ) {
      setErrors((current) => ({
        ...current,
        batches: 'Багцын код, нэр болон 0-ээс их төсөвт үнийг бүрэн оруулна уу.',
      }));
      return;
    }
    update('batches', [
      ...tender.batches,
      {
        id: `B-${Date.now()}`,
        code: batchDraft.code.trim(),
        name: batchDraft.name.trim(),
        budget,
      },
    ]);
    setBatchDraft({ code: '', name: '', budget: '' });
  };
  const addRequirement = () => {
    if (!requirementDraft.name.trim()) return;
    update('requirements', [
      ...tender.requirements,
      { id: `R-${Date.now()}`, ...requirementDraft, name: requirementDraft.name.trim() },
    ]);
    setRequirementDraft({ name: '', type: 'general', documentRequired: false });
  };
  const addCriterion = () => {
    const weight = Number(criterionDraft.weight);
    if (!criterionDraft.name.trim() || weight <= 0 || weight > 100 || criteriaWeight + weight > 100)
      return;
    update('criteria', [
      ...tender.criteria,
      {
        id: `C-${Date.now()}`,
        name: criterionDraft.name.trim(),
        type: criterionDraft.type,
        weight,
      },
    ]);
    setCriterionDraft({ name: '', type: 'technical', weight: '' });
  };
  const uploadDocuments = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    update('documents', [
      ...tender.documents,
      ...files.map((file) => ({
        id: `D-${Date.now()}-${file.name}`,
        name: file.name,
        type: 'tender' as const,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        file,
      })),
    ]);
  };
  const removeDocument = async (document: EmployeeTender['documents'][number]) => {
    const documentId = Number(document.id);
    try {
      if (!document.file && Number.isInteger(documentId) && documentId > 0) {
        await deleteEmployeeTenderDocument(documentId);
      }
      update(
        'documents',
        tender.documents.filter((item) => item.id !== document.id)
      );
    } catch (requestError) {
      setLoadError(
        requestError instanceof Error ? requestError.message : 'Баримт устгаж чадсангүй.'
      );
    }
  };
  const addMember = () => {
    const employee = employees.find((item) => String(item.empid) === memberDraft.employeeId);
    if (
      !employee ||
      tender.members.some(
        (item) => item.employeeId === employee.empid && item.role === memberDraft.role
      )
    )
      return;
    update('members', [
      ...tender.members,
      {
        id: `M-${Date.now()}`,
        employeeId: employee.empid,
        name: employee.empname?.trim() || `Ажилтан #${employee.empid}`,
        position: employee.positionname?.trim() || 'Албан тушаал бүртгэгдээгүй',
        email: employee.email?.trim() || '',
        role: memberDraft.role,
      },
    ]);
    setMemberDraft({ employeeId: '', role: 'member' });
    setEmployeeQuery('');
  };

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <Link
              href="/employee/tenders"
              className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Тендерийн жагсаалт
            </Link>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {invitationStatusLabels[tender.invitationStatusId ?? -1] ??
                  (tender.status === 'draft'
                    ? 'Ноорог'
                    : tender.status === 'ready'
                      ? 'Нийтлэхэд бэлэн'
                      : tender.status === 'published'
                        ? 'Нийтэлсэн'
                        : 'Хаагдсан')}
              </Badge>
              <span className="text-sm font-medium text-slate-500">{tender.tenderCode}</span>
              <span className="text-xs text-slate-400">{tender.invitationCode}</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              {tender.name || 'Шинэ тендер'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Сүүлд хадгалсан: {new Date(tender.updatedAt).toLocaleString('mn-MN')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'text-sm font-medium transition-opacity',
                saved ? 'text-emerald-600' : 'opacity-0'
              )}
            >
              <CheckCircle2 className="mr-1 inline h-4 w-4" />
              Хадгаллаа
            </span>
            <Button
              variant="outline"
              onClick={() => void saveDraft()}
              disabled={saving || !canEditCurrentSection}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Ноорог хадгалах
            </Button>
          </div>
        </div>

        {loadError && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {loadError}
          </div>
        )}
        {tender.invitationId > 0 && (
          <TenderWorkflowPanel
            invitationId={tender.invitationId}
            onStateChange={workflowChanged}
            hasUnsavedChanges={unsavedChanges.current || saving}
          />
        )}
        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-6">
            <div className="mb-3 rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Нийт бүрдүүлэлт</span>
                <span className="font-bold text-slate-700">{completion?.percent}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-orange-500 transition-all"
                  style={{ width: `${completion?.percent}%` }}
                />
              </div>
            </div>
            <nav className="space-y-1">
              {steps.map((item) => {
                const Icon = item.icon;
                const sectionDone =
                  item.id <= 6 ? completion?.checks[item.id - 1] : completion?.percent === 100;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStep(item.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors',
                      step === item.id
                        ? 'bg-orange-50 font-semibold text-orange-700'
                        : 'text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                        step === item.id
                          ? 'bg-orange-500 text-white'
                          : sectionDone
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-slate-100 text-slate-500'
                      )}
                    >
                      {sectionDone && step !== item.id ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main>
            <fieldset disabled={!canEditCurrentSection || saving} className="min-w-0">
              {step === 1 && (
                <Section title="Үндсэн мэдээлэл" description="">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Тендерийн нэр" error={errors.name} wide>
                      <Input
                        value={tender.name}
                        onChange={(event) => update('name', event.target.value)}
                        placeholder="Тендерийн нэр"
                      />
                    </Field>
                    <Field label="Тендерийн код">
                      <Input value={tender.tenderCode} readOnly className="bg-slate-50" />
                    </Field>
                    <Field label="Урилгын код">
                      <Input value={tender.invitationCode} readOnly className="bg-slate-50" />
                    </Field>
                    <Field label="Тендерийн төрөл" error={errors.tenderType}>
                      <Select
                        value={tender.tenderType}
                        onValueChange={(value) => update('tenderType', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Сонгох" />
                        </SelectTrigger>
                        <SelectContent>
                          {options.tenderTypes.map((item) => (
                            <SelectItem key={item.tendertypeid} value={item.tendertypename}>
                              {item.tendertypename}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Худалдан авалтын төрөл" error={errors.purchaseType}>
                      <Select
                        value={tender.purchaseType}
                        onValueChange={(value) => update('purchaseType', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Сонгох" />
                        </SelectTrigger>
                        <SelectContent>
                          {options.purchaseTypes.map((item) => (
                            <SelectItem key={item.purchasetypeid} value={item.purchasetypename}>
                              {item.purchasetypename}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Хариуцсан нэгж" error={errors.department}>
                      <Select
                        value={tender.department}
                        onValueChange={(value) => update('department', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Сонгох" />
                        </SelectTrigger>
                        <SelectContent>
                          {options.departments.map((item) => (
                            <SelectItem key={item.departmentid} value={item.departmentname}>
                              {item.departmentname}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Үйл ажиллагааны чиглэл" error={errors.activityIds}>
                      <SearchableMultiSelect
                        value={tender.activityIds.map(String)}
                        options={options.activities.map((activity) => ({
                          value: String(activity.activityid),
                          label: activity.activity,
                        }))}
                        onValueChange={(value) => update('activityIds', value.map(Number))}
                        placeholder="Чиглэл сонгох..."
                        searchPlaceholder="Чиглэл хайх..."
                        emptyMessage="Үйл ажиллагааны чиглэл олдсонгүй."
                        invalid={Boolean(errors.activityIds)}
                      />
                    </Field>
                    <Field label="Төсөвт өртөг (₮)" error={errors.budget}>
                      <Input
                        type="number"
                        min="0"
                        value={tender.budget || ''}
                        onChange={(event) => update('budget', Number(event.target.value))}
                        placeholder="0"
                      />
                      <p className="text-xs font-medium text-orange-600">
                        {formatEmployeeMoney(tender.budget)}
                      </p>
                    </Field>
                    <Field label="Тайлбар" wide>
                      <Textarea
                        value={tender.description}
                        onChange={(event) => update('description', event.target.value)}
                        placeholder="Тендерийн зорилго, хамрах хүрээ..."
                        className="min-h-28"
                      />
                    </Field>
                  </div>
                </Section>
              )}

              {step === 2 && (
                <Section
                  title="Урилга болон хугацаа"
                  description="Санал хүлээн авах, нээх, үнэлэх хугацааг дарааллаар тохируулна."
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Гэрээ эхлэх огноо" error={errors.startDate}>
                      <Input
                        type="date"
                        value={tender.startDate}
                        onChange={(event) => update('startDate', event.target.value)}
                      />
                    </Field>
                    <Field label="Гэрээ дуусах огноо" error={errors.endDate}>
                      <Input
                        type="date"
                        value={tender.endDate}
                        onChange={(event) => update('endDate', event.target.value)}
                      />
                    </Field>
                    <Field label="Санал хүлээн авах эцсийн хугацаа" error={errors.acceptDate}>
                      <Input
                        type="datetime-local"
                        value={tender.acceptDate}
                        onChange={(event) => update('acceptDate', event.target.value)}
                      />
                    </Field>
                    <Field label="Санал нээх хугацаа" error={errors.openDate}>
                      <Input
                        type="datetime-local"
                        value={tender.openDate}
                        onChange={(event) => update('openDate', event.target.value)}
                      />
                    </Field>
                    <Field label="Үнэлгээ дуусах огноо" error={errors.evaluationDate}>
                      <Input
                        type="date"
                        value={tender.evaluationDate}
                        onChange={(event) => update('evaluationDate', event.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                    <CalendarClock className="mt-0.5 h-5 w-5 shrink-0" />
                    <p>Санал нээх хугацаа нь санал хүлээн авах эцсийн хугацаанаас хойш байна.</p>
                  </div>
                </Section>
              )}

              {step === 3 && (
                <Section
                  title="Тендерийн багц"
                  description=" Нийлүүлэгч багц тус бүрээр үнийн санал өгнө."
                >
                  <div className="grid gap-3 lg:grid-cols-[160px_1fr_220px_auto]">
                    <Input
                      value={batchDraft.code}
                      onChange={(event) =>
                        setBatchDraft((current) => ({ ...current, code: event.target.value }))
                      }
                      placeholder="БАГЦ-01"
                    />
                    <Input
                      value={batchDraft.name}
                      onChange={(event) =>
                        setBatchDraft((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="Багцын нэр"
                    />
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={batchDraft.budget}
                      onChange={(event) =>
                        setBatchDraft((current) => ({ ...current, budget: event.target.value }))
                      }
                      placeholder="Төсөвт үнэ (₮)"
                    />
                    <Button
                      type="button"
                      onClick={addBatch}
                      className="bg-orange-500 hover:bg-orange-600"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Нэмэх
                    </Button>
                  </div>
                  {errors.batches && <ErrorText>{errors.batches}</ErrorText>}
                  <div className="mt-5 space-y-3">
                    {tender.batches.map((batch) => (
                      <div
                        key={batch.id}
                        className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                          <Check className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">{batch.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{batch.code}</p>
                        </div>
                        <div className="w-full space-y-1 sm:w-56">
                          <Label
                            htmlFor={`batch-budget-${batch.id}`}
                            className="text-xs text-slate-500"
                          >
                            Төсөвт үнэ (₮)
                          </Label>
                          <Input
                            id={`batch-budget-${batch.id}`}
                            type="number"
                            min="1"
                            step="1"
                            value={batch.budget || ''}
                            onChange={(event) =>
                              update(
                                'batches',
                                tender.batches.map((item) =>
                                  item.id === batch.id
                                    ? { ...item, budget: Number(event.target.value) }
                                    : item
                                )
                              )
                            }
                            placeholder="0"
                          />
                          <p className="text-xs font-medium text-orange-600">
                            {formatEmployeeMoney(batch.budget)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            update(
                              'batches',
                              tender.batches.filter((item) => item.id !== batch.id)
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4 text-slate-400" />
                        </Button>
                      </div>
                    ))}
                    {tender.batches.length > 0 && (
                      <div className="space-y-1 border-t border-slate-200 pt-3 text-sm">
                        <div className="flex justify-end">
                          <span className="text-slate-500">Багцын нийт төсөв:</span>
                          <span
                            className={cn(
                              'ml-2 font-semibold',
                              batchBudgetTotal === tender.budget
                                ? 'text-emerald-700'
                                : 'text-red-600'
                            )}
                          >
                            {formatEmployeeMoney(batchBudgetTotal)}
                          </span>
                        </div>
                        {batchBudgetTotal !== tender.budget && (
                          <p className="text-right text-xs text-red-600">
                            Тендерийн нийт төсөв {formatEmployeeMoney(tender.budget)} байна.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {step === 4 && (
                <div className="space-y-6">
                  <Section
                    title="Тавигдах шаардлага"
                    description="Нийлүүлэгчийн хангах ерөнхий, техникийн болон санхүүгийн шаардлагууд."
                  >
                    <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_auto]">
                      <Input
                        value={requirementDraft.name}
                        onChange={(event) =>
                          setRequirementDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Шаардлагын нэр"
                      />
                      <Select
                        value={requirementDraft.type}
                        onValueChange={(value: EmployeeRequirement['type']) =>
                          setRequirementDraft((current) => ({ ...current, type: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general">Ерөнхий</SelectItem>
                          <SelectItem value="technical">Техникийн</SelectItem>
                          <SelectItem value="financial">Санхүүгийн</SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm">
                        <Checkbox
                          checked={requirementDraft.documentRequired}
                          onCheckedChange={(checked) =>
                            setRequirementDraft((current) => ({
                              ...current,
                              documentRequired: checked === true,
                            }))
                          }
                        />
                        Баримт шаардах
                      </label>
                      <Button type="button" onClick={addRequirement}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {errors.requirements && <ErrorText>{errors.requirements}</ErrorText>}
                    <div className="mt-4 space-y-2">
                      {tender.requirements.map((item) => (
                        <Row
                          key={item.id}
                          title={item.name}
                          meta={`${requirementNames[item.type]}${item.documentRequired ? ' • Баримттай' : ''}`}
                          onDelete={() =>
                            update(
                              'requirements',
                              tender.requirements.filter((value) => value.id !== item.id)
                            )
                          }
                        />
                      ))}
                    </div>
                  </Section>
                  <Section
                    title="Үнэлгээний шалгуур"
                    description={`Нийт жин заавал 100% байна. Одоогийн нийлбэр: ${criteriaWeight}%`}
                  >
                    <div className="grid gap-3 lg:grid-cols-[1fr_180px_120px_auto]">
                      <Input
                        value={criterionDraft.name}
                        onChange={(event) =>
                          setCriterionDraft((current) => ({ ...current, name: event.target.value }))
                        }
                        placeholder="Шалгуурын нэр"
                      />
                      <Select
                        value={criterionDraft.type}
                        onValueChange={(value: EmployeeCriterion['type']) =>
                          setCriterionDraft((current) => ({ ...current, type: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="technical">Техникийн</SelectItem>
                          <SelectItem value="financial">Санхүүгийн</SelectItem>
                          <SelectItem value="experience">Туршлага</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={criterionDraft.weight}
                        onChange={(event) =>
                          setCriterionDraft((current) => ({
                            ...current,
                            weight: event.target.value,
                          }))
                        }
                        placeholder="Жин %"
                      />
                      <Button type="button" onClick={addCriterion}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {errors.criteria && <ErrorText>{errors.criteria}</ErrorText>}
                    <div className="mt-4 space-y-2">
                      {tender.criteria.map((item) => (
                        <Row
                          key={item.id}
                          title={item.name}
                          meta={`${criterionNames[item.type]} • ${item.weight}%`}
                          onDelete={() =>
                            update(
                              'criteria',
                              tender.criteria.filter((value) => value.id !== item.id)
                            )
                          }
                        />
                      ))}
                    </div>
                    <div className="mt-4 h-2 rounded-full bg-slate-100">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          criteriaWeight === 100
                            ? 'bg-emerald-500'
                            : criteriaWeight > 100
                              ? 'bg-red-500'
                              : 'bg-orange-500'
                        )}
                        style={{ width: `${Math.min(criteriaWeight, 100)}%` }}
                      />
                    </div>
                  </Section>
                  {showDocumentSection && (
                    <Section
                      title="Баримт бичгийн бүрдүүлэлт"
                      description="Нийлүүлэгч стандарт баримт бүрийг тусад нь хавсаргана. Тендерт зориулсан нэмэлт загвар, зааврыг сонголтоор оруулж болно."
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        {standardVendorDocuments.map((document, index) => (
                          <div
                            key={document.id}
                            className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sm font-semibold text-orange-600 shadow-sm">
                              {index + 1}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-slate-900">{document.name}</p>
                              <p className="mt-1 text-xs text-slate-500">{document.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
                        <div className="flex items-start gap-3">
                          <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0" />
                          <p>
                            Стандарт бүрдүүлэлтээс гадна тусгай маягт, техникийн загвар эсвэл нэмэлт
                            заавар шаардлагатай бол доорх хэсэгт хавсаргана.
                          </p>
                        </div>
                      </div>
                      <p className="mt-5 text-sm font-semibold text-slate-900">
                        Тусгай хэрэгцээт нэмэлт материал
                        <span className="ml-2 font-normal text-slate-500">(заавал биш)</span>
                      </p>
                      <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center hover:border-orange-300">
                        <Upload className="mx-auto h-9 w-9 text-slate-400" />
                        <p className="mt-3 text-sm font-medium text-slate-700">
                          Файл сонгох эсвэл энд чирж оруулах
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          PDF, DOCX, XLSX файлыг backend storage-д хадгална
                        </p>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.xls,.xlsx"
                          className="hidden"
                          onChange={uploadDocuments}
                        />
                      </label>
                      {errors.documents && <ErrorText>{errors.documents}</ErrorText>}
                      <div className="mt-5 space-y-3">
                        {tender.documents.map((document) => (
                          <Row
                            key={document.id}
                            title={document.name}
                            meta={`${document.type.toUpperCase()} • ${document.size}`}
                            icon={<FileText className="h-5 w-5 text-orange-500" />}
                            onDelete={() => void removeDocument(document)}
                          />
                        ))}
                      </div>
                    </Section>
                  )}
                </div>
              )}

              {step === 5 && (
                <Section
                  title="Үнэлгээний хороо"
                  description="Нээх дараалал: Нарийн бичиг → Дарга → Дотоод хяналт."
                >
                  {!canManageCommittee && (
                    <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      Үнэлгээний хороо бүрдүүлэх эрхгүй тул энэ хэсгийг зөвхөн харах боломжтой.
                    </p>
                  )}
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
                    <div className="space-y-2">
                      <Input
                        value={employeeQuery}
                        onChange={(event) => setEmployeeQuery(event.target.value)}
                        placeholder="Ажилтны нэр, имэйл эсвэл ID-аар хайх"
                      />
                      <Select
                        value={memberDraft.employeeId}
                        onValueChange={(value) => {
                          setMemberDraft((current) => ({ ...current, employeeId: value }));
                          const employee = employees.find((item) => String(item.empid) === value);
                          if (employee)
                            setEmployeeQuery(employee.empname || String(employee.empid));
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Ажилтан сонгох" />
                        </SelectTrigger>
                        <SelectContent>
                          {committeeEmployees.map((employee) => (
                            <SelectItem key={employee.empid} value={String(employee.empid)}>
                              {employee.empname || `Ажилтан #${employee.empid}`} —{' '}
                              {employee.positionname || 'Албан тушаалгүй'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Select
                      value={memberDraft.role}
                      onValueChange={(value: EmployeeMember['role']) =>
                        setMemberDraft((current) => ({ ...current, role: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="secretary">Нарийн бичиг</SelectItem>
                        <SelectItem value="chair">Дарга</SelectItem>
                        <SelectItem value="member">Гишүүн</SelectItem>
                        <SelectItem value="internal-control">Дотоод хяналт</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      onClick={addMember}
                      className="bg-orange-500 hover:bg-orange-600"
                      disabled={!memberDraft.employeeId}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Нэмэх
                    </Button>
                  </div>
                  {!employees.length && (
                    <ErrorText>TBLEMP хүснэгтэд сонгох ажилтан бүртгэгдээгүй байна.</ErrorText>
                  )}
                  {employeeQuery.trim().length > 1 && !committeeEmployees.length && (
                    <ErrorText>Тохирох ажилтан олдсонгүй.</ErrorText>
                  )}
                  {errors.members && <ErrorText>{errors.members}</ErrorText>}
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {tender.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 font-bold text-orange-600">
                          {member.name.slice(0, 1)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-900">{member.name}</p>
                            <Badge variant="secondary">{roleNames[member.role]}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{member.position}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {member.email || `Ажилтны ID: ${member.employeeId}`}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            update(
                              'members',
                              tender.members.filter((item) => item.id !== member.id)
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {step === 6 && (
                <Section
                  title="Хянаж нийтлэх"
                  description="Бүх хэсгийг шалгасны дараа нийлүүлэгчдэд тендерийн урилгыг нийтэлнэ."
                >
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {steps.slice(0, 6).map((item, index) => {
                      const done = completion?.checks[index];
                      const Icon = item.icon;
                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => setStep(item.id)}
                          className={cn(
                            'rounded-xl border p-4 text-left',
                            done
                              ? 'border-emerald-200 bg-emerald-50/60'
                              : 'border-amber-200 bg-amber-50/60'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <Icon
                              className={cn(
                                'h-5 w-5',
                                done ? 'text-emerald-600' : 'text-amber-600'
                              )}
                            />
                            {done ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            ) : (
                              <AlertCircle className="h-5 w-5 text-amber-600" />
                            )}
                          </div>
                          <p className="mt-3 font-medium text-slate-900">{item.label}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {done ? 'Бүрэн' : 'Мэдээлэл дутуу'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <dl className="grid gap-4 text-sm sm:grid-cols-2">
                      <Summary label="Тендер" value={tender.name || '—'} />
                      <Summary label="Код" value={tender.tenderCode} />
                      <Summary label="Төсөв" value={formatEmployeeMoney(tender.budget)} />
                      <Summary
                        label="Санал хүлээн авах"
                        value={tender.acceptDate.replace('T', ' ') || '—'}
                      />
                      <Summary label="Багц" value={`${tender.batches.length}`} />
                      <Summary
                        label="Багцын нийт төсөв"
                        value={formatEmployeeMoney(batchBudgetTotal)}
                      />
                      <Summary label="Шалгуурын жин" value={`${criteriaWeight}%`} />
                    </dl>
                  </div>
                  <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-orange-100 bg-orange-50 p-5">
                    <div>
                      <p className="font-semibold text-slate-900">
                        Мэдээллээ хадгалаад дээрх “Нийтлэх хүсэлт илгээх” үйлдлийг сонгоно уу.
                      </p>
                    </div>
                    <Button
                      type="button"
                      disabled={
                        completion?.percent !== 100 || !canManageTender || !editable || saving
                      }
                      onClick={() => void saveDraft()}
                      className="shrink-0 bg-orange-500 hover:bg-orange-600"
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Хадгалах
                    </Button>
                  </div>
                </Section>
              )}

              <div className="mt-6 flex justify-between gap-3">
                <Button
                  variant="outline"
                  disabled={step === 1}
                  onClick={() => setStep((current) => Math.max(current - 1, 1))}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Өмнөх
                </Button>
                {step < 6 && (
                  <Button onClick={goNext} className="bg-orange-500 hover:bg-orange-600">
                    Хадгалаад үргэлжлүүлэх
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            </fieldset>
          </main>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}
function Field({
  label,
  error,
  wide,
  children,
}: {
  label: string;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-2', wide && 'sm:col-span-2')}>
      <Label>
        {label}
        <span className="text-red-500">*</span>
      </Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
      <AlertCircle className="h-4 w-4" />
      {children}
    </p>
  );
}
function Row({
  title,
  meta,
  icon,
  onDelete,
}: {
  title: string;
  meta: string;
  icon?: React.ReactNode;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
      {icon ?? (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-sm font-bold text-orange-600">
          <Check className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{meta}</p>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onDelete}>
        <Trash2 className="h-4 w-4 text-slate-400" />
      </Button>
    </div>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
