"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, KeyRound, Loader2, Pencil, Plus, Search, Settings2, ShieldCheck, Trash2, UserRound } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  deleteEmployeeSetting,
  fetchEmployeePermission,
  fetchEmployeeSettings,
  saveEmployeeSetting,
  type EmployeeDirectoryItem,
  type EmployeeMemberType,
  type EmployeePermission,
  type EmployeeSettingAction,
  type EmployeeSettingAssignment,
} from "@/lib/api"
import { getStoredUser } from "@/lib/auth"

type Draft = {
  id?: number
  actionId: string
  memberTypeId: string
  employeeId: string
}

const emptyDraft: Draft = { actionId: "", memberTypeId: "", employeeId: "" }

export default function EmployeeSettingsPage() {
  const [assignments, setAssignments] = useState<EmployeeSettingAssignment[]>([])
  const [actions, setActions] = useState<EmployeeSettingAction[]>([])
  const [memberTypes, setMemberTypes] = useState<EmployeeMemberType[]>([])
  const [employees, setEmployees] = useState<EmployeeDirectoryItem[]>([])
  const [permission, setPermission] = useState<EmployeePermission | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [employeeQuery, setEmployeeQuery] = useState("")
  const [tableQuery, setTableQuery] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<EmployeeSettingAssignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const user = getStoredUser()
  const currentEmployeeId = user?.employeeId ?? user?.userId ?? 0
  const currentUser = user?.username ?? ""

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    setError("")
    try {
      const [settings, currentPermission] = await Promise.all([
        fetchEmployeeSettings(),
        currentEmployeeId > 0 ? fetchEmployeePermission(currentEmployeeId).catch(() => null) : Promise.resolve(null),
      ])
      setAssignments(settings.assignments)
      setActions(settings.actions)
      setMemberTypes(settings.memberTypes)
      setEmployees(settings.employees)
      setPermission(currentPermission)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Тохиргооны мэдээллийг ачаалж чадсангүй.")
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [currentEmployeeId])

  useEffect(() => { void load() }, [load])

  const employeeOptions = useMemo(() => {
    const normalized = employeeQuery.trim().toLowerCase()
    if (normalized.length < 2) return []
    return employees.filter((employee) => `${employee.empname ?? ""} ${employee.email ?? ""} ${employee.empid}`.toLowerCase().includes(normalized)).slice(0, 8)
  }, [employeeQuery, employees])

  const selectedEmployee = employees.find((employee) => employee.empid === Number(draft.employeeId))
  const filteredAssignments = useMemo(() => {
    const normalized = tableQuery.trim().toLowerCase()
    if (!normalized) return assignments
    return assignments.filter((assignment) => `${assignment.empname ?? ""} ${assignment.email ?? ""} ${assignment.actionname ?? ""} ${assignment.membertypename ?? ""}`.toLowerCase().includes(normalized))
  }, [assignments, tableQuery])

  const resetDraft = () => {
    setDraft(emptyDraft)
    setEmployeeQuery("")
  }

  const edit = (assignment: EmployeeSettingAssignment) => {
    setDraft({
      id: assignment.id,
      actionId: String(assignment.actionid),
      memberTypeId: String(assignment.membertypeid),
      employeeId: String(assignment.empid),
    })
    setEmployeeQuery(assignment.empname ?? "")
    setNotice("")
    setError("")
  }

  const save = async () => {
    if (!draft.actionId || !draft.memberTypeId || !draft.employeeId) {
      setError("Ажилтан, үйлдэл болон гишүүний төрлийг бүрэн сонгоно уу.")
      return
    }
    const duplicate = assignments.some((assignment) =>
      assignment.id !== draft.id
      && assignment.actionid === Number(draft.actionId)
      && assignment.membertypeid === Number(draft.memberTypeId)
      && assignment.empid === Number(draft.employeeId),
    )
    if (duplicate) {
      setError("Ижил ажилтан, үйлдэл, гишүүний төрөлтэй тохиргоо бүртгэлтэй байна.")
      return
    }

    setSaving(true)
    setError("")
    setNotice("")
    try {
      await saveEmployeeSetting({
        id: draft.id,
        actionId: Number(draft.actionId),
        memberTypeId: Number(draft.memberTypeId),
        employeeId: Number(draft.employeeId),
        currentUser,
      })
      setNotice(draft.id ? "Тохиргооны мөр шинэчлэгдлээ." : "Шинэ эрхийн тохиргоо нэмэгдлээ.")
      resetDraft()
      await load(false)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Тохиргоог хадгалж чадсангүй.")
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!deleteTarget) return
    setSaving(true)
    setError("")
    setNotice("")
    try {
      await deleteEmployeeSetting(deleteTarget.id, currentUser)
      setAssignments((current) => current.filter((assignment) => assignment.id !== deleteTarget.id))
      if (draft.id === deleteTarget.id) resetDraft()
      setNotice("Тохиргооны мөр устгагдлаа.")
      setDeleteTarget(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Тохиргоог устгаж чадсангүй.")
    } finally {
      setSaving(false)
    }
  }

  const assignedEmployees = new Set(assignments.map((assignment) => assignment.empid)).size
  const permissionCount = permission ? [permission.isClose, permission.isHold, permission.isReopen, permission.isCancel, permission.isJWAdmin, permission.isAdmin].filter(Boolean).length : 0

  return (
    <div className="min-h-full bg-slate-50 p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="pl-11 sm:pl-0">
          <p className="text-xs font-semibold uppercase text-orange-600">ТЕНДЕРИЙН АЖИЛТАН</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Тохиргоо</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">Тендерийн үйлдэл бүрийн эрх, хорооны үүрэг болон хариуцах ажилтныг удирдана.</p>
        </header>

        {error && <Alert variant="destructive" className="mt-6 bg-white"><Settings2 /><AlertTitle>Үйлдэл амжилтгүй</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {notice && <Alert className="mt-6 border-emerald-200 bg-emerald-50 text-emerald-800"><CheckCircle2 /><AlertTitle>Амжилттай</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>}

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Тохиргооны үзүүлэлт">
          <Summary label="Эрхийн мөр" value={assignments.length} icon={KeyRound} tone="bg-orange-50 text-orange-600" loading={loading} />
          <Summary label="Тохируулсан ажилтан" value={assignedEmployees} icon={UserRound} tone="bg-blue-50 text-blue-600" loading={loading} />
          <Summary label="Үйлдлийн төрөл" value={actions.length} icon={Settings2} tone="bg-violet-50 text-violet-600" loading={loading} />
          <Summary label="Таны эрх" value={permissionCount} icon={ShieldCheck} tone="bg-emerald-50 text-emerald-600" loading={loading} />
        </section>

        <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="h-fit rounded-lg border-slate-200 shadow-sm xl:sticky xl:top-6">
            <CardHeader className="border-b border-slate-100"><CardTitle className="flex items-center gap-2 text-lg">{draft.id ? <Pencil className="size-4 text-orange-600" /> : <Plus className="size-4 text-orange-600" />}{draft.id ? "Тохиргоо засах" : "Эрхийн мөр нэмэх"}</CardTitle><p className="mt-1 text-sm text-slate-500">Ажилтан болон гүйцэтгэх үйлдлийг холбоно.</p></CardHeader>
            <CardContent className="space-y-5">
              <div>
                <label htmlFor="employee-search" className="mb-2 block text-sm font-medium text-slate-800">Ажилтан</label>
                <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="employee-search" value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} placeholder="Нэр, имэйл, ID-аар хайх" className="pl-9" /></div>
                {selectedEmployee && <div className="mt-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2"><p className="truncate text-sm font-medium text-orange-900">{selectedEmployee.empname || `Ажилтан #${selectedEmployee.empid}`}</p><p className="truncate text-xs text-orange-700">{selectedEmployee.email || selectedEmployee.positionname || "Имэйл бүртгэгдээгүй"}</p></div>}
                {employeeOptions.length > 0 && <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-sm">{employeeOptions.map((employee) => <button key={employee.empid} type="button" onClick={() => { setDraft((current) => ({ ...current, employeeId: String(employee.empid) })); setEmployeeQuery(employee.empname ?? String(employee.empid)) }} className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50"><p className="truncate text-sm font-medium text-slate-800">{employee.empname || `Ажилтан #${employee.empid}`}</p><p className="truncate text-xs text-slate-500">{employee.positionname || employee.email || employee.empid}</p></button>)}</div>}
                {employeeQuery.trim().length > 1 && !employeeOptions.length && <p className="mt-2 text-xs text-slate-500">Тохирох ажилтан олдсонгүй.</p>}
              </div>

              <div><label className="mb-2 block text-sm font-medium text-slate-800">Үйлдэл</label><Select value={draft.actionId} onValueChange={(value) => setDraft((current) => ({ ...current, actionId: value }))}><SelectTrigger className="w-full"><SelectValue placeholder="Үйлдэл сонгох" /></SelectTrigger><SelectContent>{actions.map((action) => <SelectItem key={action.id} value={String(action.id)}>{action.actionname || action.actioncode || `Үйлдэл #${action.id}`}</SelectItem>)}</SelectContent></Select></div>
              <div><label className="mb-2 block text-sm font-medium text-slate-800">Гишүүний төрөл</label><Select value={draft.memberTypeId} onValueChange={(value) => setDraft((current) => ({ ...current, memberTypeId: value }))}><SelectTrigger className="w-full"><SelectValue placeholder="Үүрэг сонгох" /></SelectTrigger><SelectContent>{memberTypes.map((memberType) => <SelectItem key={memberType.membertypeid} value={String(memberType.membertypeid)}>{memberType.membertypename || `Төрөл #${memberType.membertypeid}`}</SelectItem>)}</SelectContent></Select></div>

              <div className="flex gap-2"><Button onClick={() => void save()} disabled={saving || loading} className="flex-1 bg-orange-500 text-white hover:bg-orange-600">{saving ? <Loader2 className="size-4 animate-spin" /> : draft.id ? <Pencil className="size-4" /> : <Plus className="size-4" />}{saving ? "Хадгалж байна" : draft.id ? "Өөрчлөлт хадгалах" : "Тохиргоо нэмэх"}</Button>{draft.id && <Button variant="outline" onClick={resetDraft} disabled={saving}>Болих</Button>}</div>
            </CardContent>
          </Card>

          <Card className="min-w-0 rounded-lg border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="text-lg">Эрхийн тохиргоо</CardTitle><p className="mt-1 text-sm text-slate-500">Backend-ийн TBLSETTINGS хүснэгтэд бүртгэгдсэн мөрүүд</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={tableQuery} onChange={(event) => setTableQuery(event.target.value)} placeholder="Тохиргооноос хайх" className="pl-9" /></div></div></CardHeader>
            <CardContent className="p-0">
              {loading ? <div className="space-y-3 p-6">{Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-16 w-full rounded-md" />)}</div> : filteredAssignments.length ? <div className="divide-y divide-slate-100">{filteredAssignments.map((assignment) => <div key={assignment.id} className={`grid min-w-0 gap-4 p-5 ${draft.id === assignment.id ? "bg-orange-50/60" : "hover:bg-slate-50"} md:grid-cols-[minmax(0,1fr)_180px_150px_80px] md:items-center`}><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{assignment.empname || `Ажилтан #${assignment.empid}`}</p><p className="mt-1 truncate text-xs text-slate-500">{assignment.email || `ID: ${assignment.empid}`}</p></div><div><p className="text-xs text-slate-500">Үйлдэл</p><Badge variant="secondary" className="mt-1 max-w-full truncate font-normal">{assignment.actionname || assignment.actioncode}</Badge></div><div><p className="text-xs text-slate-500">Үүрэг</p><p className="mt-1 truncate text-sm font-medium text-slate-800">{assignment.membertypename || "Тодорхойгүй"}</p></div><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Засах" onClick={() => edit(assignment)}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" title="Устгах" className="text-slate-500 hover:bg-red-50 hover:text-red-600" onClick={() => setDeleteTarget(assignment)}><Trash2 className="size-4" /></Button></div></div>)}</div> : <Empty className="min-h-72 py-12"><EmptyHeader><EmptyMedia variant="icon" className="bg-slate-100 text-slate-600"><Settings2 /></EmptyMedia><EmptyTitle className="text-base">Тохиргоо олдсонгүй</EmptyTitle><EmptyDescription>Хайлтаа өөрчлөх эсвэл шинэ эрхийн мөр нэмнэ үү.</EmptyDescription></EmptyHeader></Empty>}
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Тохиргоог устгах уу?</AlertDialogTitle><AlertDialogDescription>{deleteTarget?.empname || "Сонгосон ажилтан"}-д оноосон “{deleteTarget?.actionname || deleteTarget?.actioncode}” эрхийн мөр бүрмөсөн устна.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Болих</AlertDialogCancel><AlertDialogAction onClick={() => void remove()} disabled={saving} className="bg-red-600 text-white hover:bg-red-700">{saving && <Loader2 className="size-4 animate-spin" />}Устгах</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Summary({ label, value, icon: Icon, tone, loading }: { label: string; value: number; icon: typeof Settings2; tone: string; loading: boolean }) {
  return <Card className="gap-0 rounded-lg border-slate-200 py-0 shadow-sm"><CardContent className="flex items-center justify-between gap-4 p-5"><div><p className="text-sm text-slate-500">{label}</p>{loading ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>}</div><span className={`flex size-10 shrink-0 items-center justify-center rounded-md ${tone}`}><Icon className="size-5" /></span></CardContent></Card>
}
