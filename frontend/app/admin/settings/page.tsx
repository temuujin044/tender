'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { DataPagination } from '@/components/data-pagination';
import { Skeleton } from '@/components/ui/skeleton';
import {
  deleteEmployeeSetting,
  fetchEmployeePermission,
  fetchEmployeeSettings,
  replaceEmployeeSettings,
  type EmployeeDirectoryItem,
  type EmployeePermission,
  type EmployeeSettingAction,
  type EmployeeSettingAssignment,
} from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

type Draft = {
  actionIds: string[];
  originalActionIds: string[];
  employeeId: string;
};

type EmployeeAssignmentGroup = {
  empid: number;
  empname?: string | null;
  email?: string | null;
  permissions: EmployeeSettingAssignment[];
};

const emptyDraft: Draft = { actionIds: [], originalActionIds: [], employeeId: '' };

export default function EmployeeSettingsPage() {
  const [assignments, setAssignments] = useState<EmployeeSettingAssignment[]>([]);
  const [actions, setActions] = useState<EmployeeSettingAction[]>([]);
  const [employees, setEmployees] = useState<EmployeeDirectoryItem[]>([]);
  const [permission, setPermission] = useState<EmployeePermission | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [tableQuery, setTableQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EmployeeSettingAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const user = getStoredUser();
  const currentEmployeeId = user?.employeeId ?? 0;
  const currentUser = user?.username ?? '';

  const load = useCallback(
    async (showLoader = true) => {
      if (showLoader) setLoading(true);
      setError('');
      try {
        const [settings, currentPermission] = await Promise.all([
          fetchEmployeeSettings(),
          currentEmployeeId > 0
            ? fetchEmployeePermission(currentEmployeeId).catch(() => null)
            : Promise.resolve(null),
        ]);
        setAssignments(settings.assignments);
        setActions(settings.actions);
        setEmployees(settings.employees);
        setPermission(currentPermission);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Тохиргооны мэдээллийг ачаалж чадсангүй.'
        );
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [currentEmployeeId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const employeeOptions = useMemo(() => {
    const normalized = employeeQuery.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return employees
      .filter((employee) =>
        `${employee.empname ?? ''} ${employee.email ?? ''}`.toLowerCase().includes(normalized)
      )
      .slice(0, 8);
  }, [employeeQuery, employees]);

  const selectedEmployee = employees.find(
    (employee) => employee.empid === Number(draft.employeeId)
  );
  const assignmentGroups = useMemo(() => {
    const groups = new Map<number, EmployeeAssignmentGroup>();
    for (const assignment of assignments) {
      const group = groups.get(assignment.empid);
      if (group) {
        group.permissions.push(assignment);
      } else {
        groups.set(assignment.empid, {
          empid: assignment.empid,
          empname: assignment.empname,
          email: assignment.email,
          permissions: [assignment],
        });
      }
    }
    return Array.from(groups.values());
  }, [assignments]);
  const filteredAssignmentGroups = useMemo(() => {
    const normalized = tableQuery.trim().toLowerCase();
    if (!normalized) return assignmentGroups;
    return assignmentGroups.filter((group) =>
      `${group.empname ?? ''} ${group.email ?? ''} ${group.permissions
        .map((permission) => `${permission.actionname ?? ''} ${permission.actioncode ?? ''}`)
        .join(' ')}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [assignmentGroups, tableQuery]);
  const pageCount = Math.max(1, Math.ceil(filteredAssignmentGroups.length / pageSize));
  const visibleAssignmentGroups = useMemo(
    () => filteredAssignmentGroups.slice((page - 1) * pageSize, page * pageSize),
    [filteredAssignmentGroups, page, pageSize]
  );
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const resetDraft = () => {
    setDraft(emptyDraft);
    setEmployeeQuery('');
  };

  const edit = (group: EmployeeAssignmentGroup) => {
    const actionIds = group.permissions.map((permission) => String(permission.actionid));
    setDraft({
      actionIds,
      originalActionIds: actionIds,
      employeeId: String(group.empid),
    });
    setEmployeeQuery('');
    setNotice('');
    setError('');
  };

  const save = async () => {
    const actionIds = draft.actionIds.map(Number);
    if (!draft.employeeId) {
      setError('Ажилтан сонгоно уу.');
      return;
    }
    if (!actionIds.length && !draft.originalActionIds.length) {
      setError('Дор хаяж нэг эрх сонгоно уу.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      await replaceEmployeeSettings({
        actionIds,
        employeeId: Number(draft.employeeId),
        currentUser,
      });
      setNotice(
        actionIds.length
          ? `${actionIds.length} эрхийн тохиргоо хадгалагдлаа.`
          : 'Хэрэглэгчийн бүх эрх хасагдлаа.'
      );
      resetDraft();
      setTableQuery('');
      setPage(1);
      await load(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Тохиргоог хадгалж чадсангүй.'
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await deleteEmployeeSetting(deleteTarget.id, currentUser);
      setAssignments((current) =>
        current.filter((assignment) => assignment.id !== deleteTarget.id)
      );
      if (Number(draft.employeeId) === deleteTarget.empid) resetDraft();
      setNotice('Тохиргооны мөр устгагдлаа.');
      setDeleteTarget(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Тохиргоог устгаж чадсангүй.'
      );
    } finally {
      setSaving(false);
    }
  };

  const assignedEmployees = new Set(assignments.map((assignment) => assignment.empid)).size;
  const permissionCount = permission
    ? [
        permission.isTenderManage,
        permission.isCommitteeManage,
        permission.isTenderEvaluate,
        permission.isTenderApprove,
        permission.isTenderCancel,
        permission.isAdmin,
      ].filter(Boolean).length
    : 0;

  return (
    <div className="min-h-full bg-slate-50 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="pl-11 sm:pl-0">
          <p className="text-xs font-semibold uppercase text-orange-600">АДМИН УДИРДЛАГА</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Тохиргоо</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">
            Тендерийн үйлдэл бүрийн эрх, хорооны үүрэг болон хариуцах ажилтныг удирдана.
          </p>
        </header>

        {error && (
          <Alert variant="destructive" className="mt-6 bg-white">
            <Settings2 />
            <AlertTitle>Үйлдэл амжилтгүй</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert className="mt-6 border-emerald-200 bg-emerald-50 text-emerald-800">
            <CheckCircle2 />
            <AlertTitle>Амжилттай</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <section
          className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Тохиргооны үзүүлэлт"
        >
          <Summary
            label="Эрхийн мөр"
            value={assignments.length}
            icon={KeyRound}
            tone="bg-orange-50 text-orange-600"
            loading={loading}
          />
          <Summary
            label="Тохируулсан ажилтан"
            value={assignedEmployees}
            icon={UserRound}
            tone="bg-blue-50 text-blue-600"
            loading={loading}
          />
          <Summary
            label="Үйлдлийн төрөл"
            value={actions.length}
            icon={Settings2}
            tone="bg-violet-50 text-violet-600"
            loading={loading}
          />
          <Summary
            label="Таны эрх"
            value={permissionCount}
            icon={ShieldCheck}
            tone="bg-emerald-50 text-emerald-600"
            loading={loading}
          />
        </section>

        <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="h-fit rounded-lg border-slate-200 shadow-sm xl:sticky xl:top-6">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="flex items-center gap-2 text-lg">
                {draft.originalActionIds.length ? (
                  <Pencil className="size-4 text-orange-600" />
                ) : (
                  <Plus className="size-4 text-orange-600" />
                )}
                {draft.originalActionIds.length ? 'Эрхийн тохиргоо засах' : 'Эрхийн мөр нэмэх'}
              </CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Ажилтан болон гүйцэтгэх үйлдлийг холбоно.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label
                  htmlFor="employee-search"
                  className="mb-2 block text-sm font-medium text-slate-800"
                >
                  Ажилтан
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="employee-search"
                    value={employeeQuery}
                    onChange={(event) => {
                      setEmployeeQuery(event.target.value);
                      if (draft.employeeId) setDraft(emptyDraft);
                    }}
                    placeholder="Нэр эсвэл имэйлээр хайх"
                    className="pl-9"
                  />
                </div>
                {selectedEmployee && (
                  <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2">
                    <p className="truncate text-sm font-medium text-orange-900">
                      {selectedEmployee.empname || selectedEmployee.email || 'Нэр бүртгэгдээгүй'}
                    </p>
                    <p className="truncate text-xs text-orange-700">
                      {selectedEmployee.email ||
                        selectedEmployee.positionname ||
                        'Имэйл бүртгэгдээгүй'}
                    </p>
                  </div>
                )}
                {employeeOptions.length > 0 && (
                  <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-sm">
                    {employeeOptions.map((employee) => (
                      <button
                        key={employee.empid}
                        type="button"
                        onClick={() => {
                          const assignedActionIds = assignments
                            .filter((assignment) => assignment.empid === employee.empid)
                            .map((assignment) => String(assignment.actionid));
                          setDraft({
                            employeeId: String(employee.empid),
                            actionIds: assignedActionIds,
                            originalActionIds: assignedActionIds,
                          });
                          setEmployeeQuery('');
                        }}
                        className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50"
                      >
                        <p className="truncate text-sm font-medium text-slate-800">
                          {employee.empname || employee.email || 'Нэр бүртгэгдээгүй'}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {employee.positionname || employee.email || 'Албан тушаал бүртгэгдээгүй'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {employeeQuery.trim().length > 1 && !employeeOptions.length && (
                  <p className="mt-2 text-xs text-slate-500">Тохирох ажилтан олдсонгүй.</p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-800">Үйлдлүүд</label>
                <div className="space-y-2 rounded-md border border-slate-200 p-3">
                  {actions.map((action) => {
                    const value = String(action.id);
                    const selected = draft.actionIds.includes(value);
                    const wasAssigned = draft.originalActionIds.includes(value);
                    return (
                      <label
                        key={action.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-slate-50 ${
                          !draft.employeeId ? 'cursor-not-allowed opacity-50' : ''
                        }`}
                      >
                        <Checkbox
                          checked={selected}
                          disabled={!draft.employeeId || saving}
                          onCheckedChange={(checked) =>
                            setDraft((current) => ({
                              ...current,
                              actionIds: checked
                                ? Array.from(new Set([...current.actionIds, value]))
                                : current.actionIds.filter((actionId) => actionId !== value),
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1 text-sm">
                          {action.actionname || action.actioncode || `Үйлдэл #${action.id}`}
                        </span>
                        {wasAssigned && selected && (
                          <span className="text-[11px] font-medium text-emerald-600">Олгосон</span>
                        )}
                        {wasAssigned && !selected && (
                          <span className="text-[11px] font-medium text-red-600">Хасна</span>
                        )}
                        {!wasAssigned && selected && (
                          <span className="text-[11px] font-medium text-orange-600">Нэмнэ</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => void save()}
                  disabled={saving || loading}
                  className="flex-1 bg-orange-500 text-white hover:bg-orange-600"
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : draft.originalActionIds.length ? (
                    <Pencil className="size-4" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {saving ? 'Хадгалж байна' : 'Эрхийн тохиргоо хадгалах'}
                </Button>
                {draft.employeeId && (
                  <Button variant="outline" onClick={resetDraft} disabled={saving}>
                    Болих
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="min-w-0 rounded-lg border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg">Эрхийн тохиргоо</CardTitle>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={tableQuery}
                    onChange={(event) => {
                      setTableQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Тохиргооноос хайх"
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-3 p-6">
                  {Array.from({ length: 7 }, (_, index) => (
                    <Skeleton key={index} className="h-16 w-full rounded-md" />
                  ))}
                </div>
              ) : filteredAssignmentGroups.length ? (
                <>
                  <div className="divide-y divide-slate-100">
                    {visibleAssignmentGroups.map((group) => (
                      <div
                        key={group.empid}
                        className={`grid min-w-0 gap-4 p-5 ${
                          Number(draft.employeeId) === group.empid
                            ? 'bg-orange-50/60'
                            : 'hover:bg-slate-50'
                        } md:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.3fr)] md:items-start`}
                      >
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">
                              {group.empname || `Ажилтан #${group.empid}`}
                            </p>
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {group.email || `ID: ${group.empid}`}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Бүх эрхийг засах"
                            className="size-8 shrink-0"
                            onClick={() => edit(group)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </div>
                        <div className="min-w-0">
                          <p className="mb-2 text-xs text-slate-500">
                            Олгосон эрх ({group.permissions.length})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {group.permissions.map((permission) => (
                              <div
                                key={permission.id}
                                className="flex min-w-0 items-center gap-1 rounded-md border border-slate-200 bg-white p-1 pl-2"
                              >
                                <Badge
                                  variant="secondary"
                                  className="max-w-56 truncate font-normal"
                                >
                                  {permission.actionname || permission.actioncode}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Устгах"
                                  className="size-7 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                  onClick={() => setDeleteTarget(permission)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <DataPagination
                    page={page}
                    pageSize={pageSize}
                    totalItems={filteredAssignmentGroups.length}
                    itemLabel="ажилтан"
                    busy={loading || saving}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(1);
                    }}
                  />
                </>
              ) : (
                <Empty className="min-h-72 py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon" className="bg-slate-100 text-slate-600">
                      <Settings2 />
                    </EmptyMedia>
                    <EmptyTitle className="text-base">Тохиргоо олдсонгүй</EmptyTitle>
                    <EmptyDescription>
                      Хайлтаа өөрчлөх эсвэл шинэ эрхийн мөр нэмнэ үү.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Тохиргоог устгах уу?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.empname || 'Сонгосон ажилтан'}-д оноосон “
              {deleteTarget?.actionname || deleteTarget?.actioncode}” эрхийн мөр бүрмөсөн устна.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Болих</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void remove()}
              disabled={saving}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}Устгах
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Summary({
  label,
  value,
  icon: Icon,
  tone,
  loading,
}: {
  label: string;
  value: number;
  icon: typeof Settings2;
  tone: string;
  loading: boolean;
}) {
  return (
    <Card className="gap-0 rounded-lg border-slate-200 py-0 shadow-sm">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-16" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
          )}
        </div>
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-md ${tone}`}>
          <Icon className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}
