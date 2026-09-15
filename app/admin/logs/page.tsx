'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { History, Loader2, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DataPagination } from '@/components/data-pagination';
import { useAuditAccess } from '@/hooks/use-audit-access';
import {
  ApiError,
  fetchAuditDetail,
  fetchAuditEvents,
  type AuditDetail,
  type AuditEvent,
  type AuditFilters,
  type AuditList,
} from '@/lib/api';
import { auditActionLabel, auditTime, auditValue } from '@/lib/audit-display';

function roleLabel(role: AuditEvent['role']) {
  if (role === 'admin') return 'Админ';
  return role === 'employee' ? 'Ажилтан' : 'Нийлүүлэгч';
}

function Outcome({ value }: { value: AuditEvent['outcome'] }) {
  return (
    <Badge
      variant={value === 'failed' ? 'destructive' : 'secondary'}
      className="px-1.5 py-0.5 text-[11px] leading-4"
    >
      {value === 'success' ? 'Амжилттай' : value === 'failed' ? 'Амжилтгүй' : 'Боловсруулж байна'}
    </Badge>
  );
}

function EventDetails({ eventId, onClose }: { eventId: number; onClose: () => void }) {
  const [data, setData] = useState<AuditDetail | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError('');
    void fetchAuditDetail(eventId, page, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Дэлгэрэнгүйг ачаалж чадсангүй.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [eventId, page, revision]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Үйлдлийн дэлгэрэнгүй</DialogTitle>
          <DialogDescription>Нэмсэн агуулга болон бодит өөрчлөлтүүд</DialogDescription>
        </DialogHeader>
        {loading && (
          <p role="status" className="flex items-center gap-2 py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Ачаалж байна…
          </p>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error}{' '}
              <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>
                Дахин оролдох
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {data && (
          <>
            <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
              <p className="font-semibold">
                {data.event.title ?? auditActionLabel(data.event.action)}
              </p>
              {data.event.entity_name && (
                <p>
                  {data.event.entity_code} · {data.event.entity_name}
                </p>
              )}
              <p>
                {data.event.username} · {roleLabel(data.event.role)} ·{' '}
                {auditTime(data.event.occurred_at)}
              </p>
              <Outcome value={data.event.outcome} />
              {data.event.outcome === 'failed' && (
                <p className="text-slate-600">Энэ оролдлогын өөрчлөлт хадгалагдаагүй.</p>
              )}
            </div>
            {data.count === 0 && (
              <p className="py-6 text-center text-slate-500">Нэмэлт дэлгэрэнгүй байхгүй.</p>
            )}
            {(data.details ?? []).map((change, index) => {
              const keys = Array.from(
                new Set([...Object.keys(change.before ?? {}), ...Object.keys(change.after ?? {})])
              );
              const changed = keys.filter(
                (key) =>
                  JSON.stringify(change.before?.[key]) !== JSON.stringify(change.after?.[key])
              );
              return (
                <section
                  key={`${page}-${index}`}
                  className="overflow-hidden rounded-lg border border-slate-200"
                >
                  <div className="space-y-1 bg-slate-50 px-4 py-3 text-sm">
                    <p className="font-medium">
                      {change.category}{' '}
                      {change.operation === 'insert'
                        ? 'нэмсэн'
                        : change.operation === 'delete'
                          ? 'хассан'
                          : 'зассан'}
                    </p>
                  </div>
                  {change.operation !== 'update' ? (
                    <dl className="space-y-3 p-4 text-sm">
                      {Object.entries(change.after ?? change.before ?? {}).map(([label, value]) => (
                        <div key={label}>
                          <dt className="mb-1 text-xs text-slate-500">{label}</dt>
                          <dd className="whitespace-pre-wrap break-words">{auditValue(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : changed.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">
                      Харагдах утгын ялгаа байхгүй. Нууцалсан талбар өөрчлөгдсөн байж болно.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full table-fixed text-sm">
                        <thead className="border-b text-left text-slate-500">
                          <tr>
                            <th className="w-1/4 p-3">Талбар</th>
                            <th className="p-3">Өмнө</th>
                            <th className="p-3">Дараа</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changed.map((key) => (
                            <tr key={key} className="border-b last:border-0">
                              <th
                                scope="row"
                                className="break-words p-3 text-left align-top font-medium"
                              >
                                {key}
                              </th>
                              <td className="whitespace-pre-wrap break-words bg-red-50/40 p-3 align-top">
                                {auditValue(change.before?.[key])}
                              </td>
                              <td className="whitespace-pre-wrap break-words bg-emerald-50/40 p-3 align-top">
                                {auditValue(change.after?.[key])}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
            <DataPagination
              page={page}
              totalItems={data.count}
              pageSize={data.page_size}
              itemLabel="өөрчлөлт"
              busy={loading}
              onPageChange={setPage}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const emptyFilters: AuditFilters = {};

export default function EmployeeLogsPage() {
  const access = useAuditAccess();
  const [draft, setDraft] = useState<AuditFilters>(emptyFilters);
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<AuditList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    setData(null);
    setSelectedId(null);
    if (access.status !== 'allowed') return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setDenied(false);
    void fetchAuditEvents(filters, page, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setDenied(reason instanceof ApiError && [401, 403].includes(reason.status));
          setError(reason instanceof Error ? reason.message : 'Үйлдлийн түүхийг ачаалж чадсангүй.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [access.status, filters, page, revision]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setFilters({ ...draft });
  }

  const fields: { key: keyof AuditFilters; label: string; type?: string }[] = [
    { key: 'username', label: 'Хэрэглэгчийн нэр' },
    { key: 'date_from', label: 'Эхлэх огноо', type: 'date' },
    { key: 'date_to', label: 'Дуусах огноо', type: 'date' },
    { key: 'entity', label: 'Тендерийн нэр, код' },
  ];

  if (access.status === 'checking')
    return (
      <div role="status" className="flex items-center gap-2 p-8 pt-20 lg:pt-8">
        <Loader2 className="h-5 w-5 animate-spin" /> Эрх шалгаж байна…
      </div>
    );
  if (access.status !== 'allowed' || denied)
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-slate-400" />
        <h1 className="text-xl font-semibold">
          {access.status === 'error' ? 'Эрх шалгаж чадсангүй' : 'Үйлдлийн түүх харах эрхгүй байна'}
        </h1>
        <p className="mt-3 text-sm text-slate-500">
          {access.status === 'error'
            ? 'Холболтоо шалгаад дахин оролдоно уу.'
            : 'Нэвтрэлтээ шалгана уу. Энэ хэсэгт хандах эрхийг системийн администратор олгоно.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setDenied(false);
              access.retry();
            }}
          >
            Дахин шалгах
          </Button>
          <Button asChild>
            <Link href="/admin">Админ самбар</Link>
          </Button>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-10 pt-20 sm:px-8 lg:pt-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <History className="h-6 w-6 text-orange-500" /> Үйлдлийн түүх
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Ажилтан, нийлүүлэгчийн хийсэн өөрчлөлтүүд · Улаанбаатарын цагаар
          </p>
        </div>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw className="h-4 w-4" /> Шинэчлэх
        </Button>
      </header>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={applyFilters} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {fields.map(({ key, label, type }) => (
                <label key={key} className="space-y-1.5 text-sm font-medium text-slate-600">
                  <span>{label}</span>
                  <Input
                    type={type ?? 'text'}
                    min={type === 'number' ? 1 : undefined}
                    step={type === 'number' ? 1 : undefined}
                    max={key === 'date_from' ? draft.date_to || undefined : undefined}
                    value={draft[key] ?? ''}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                </label>
              ))}
              <label className="space-y-1.5 text-sm font-medium text-slate-600">
                <span>Хэрэглэгчийн төрөл</span>
                <select
                  className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                  value={draft.role ?? ''}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, role: event.target.value }))
                  }
                >
                  <option value="">Бүгд</option>
                  <option value="admin">Админ</option>
                  <option value="employee">Ажилтан</option>
                  <option value="vendor">Нийлүүлэгч</option>
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-600">
                <span>Үр дүн</span>
                <select
                  className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                  value={draft.outcome ?? ''}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, outcome: event.target.value }))
                  }
                >
                  <option value="">Бүгд</option>
                  <option value="success">Амжилттай</option>
                  <option value="failed">Амжилтгүй</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                <Search className="h-4 w-4" /> Шүүх
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={() => {
                  setDraft(emptyFilters);
                  setFilters({});
                  setPage(1);
                }}
              >
                Цэвэрлэх
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p role="status" className="flex justify-center gap-2 py-12 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Ачаалж байна…
            </p>
          ) : (
            data && (
              <>
                {data.results.length === 0 ? (
                  <div className="py-14 text-center">
                    <History className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                    <p className="font-medium text-slate-600">Бүртгэл олдсонгүй</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Шүүлтүүрээ өөрчлөх эсвэл шинэ үйлдэл хийсний дараа шинэчилнэ үү.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left text-xs leading-4">
                      <thead className="border-b text-slate-500">
                        <tr>
                          {[
                            'Огноо, цаг',
                            'Хэрэглэгч',
                            'Тендер',
                            'Үйлдэл',
                            'Үр дүн',
                            'Өөрчлөлт',
                            'Дэлгэрэнгүй',
                          ].map((title) => (
                            <th key={title} className="px-2 py-2 font-medium">
                              {title}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.results.map((event) => (
                          <tr key={event.id} className="border-b last:border-0 hover:bg-slate-50">
                            <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                              {auditTime(event.occurred_at)}
                            </td>
                            <td className="px-2 py-2">
                              <p className="font-medium">{event.username}</p>
                              <p className="text-[11px] leading-4 text-slate-500">
                                {roleLabel(event.role)}
                              </p>
                            </td>
                            <td className="max-w-xs break-words px-2 py-2">
                              <p>{event.entity_name || '—'}</p>
                              {event.entity_code && (
                                <p className="text-[11px] text-slate-500">{event.entity_code}</p>
                              )}
                            </td>
                            <td className="max-w-xs break-words px-2 py-2">
                              {event.title ?? auditActionLabel(event.action)}
                            </td>
                            <td className="px-2 py-2">
                              <Outcome value={event.outcome} />
                            </td>
                            <td className="px-2 py-2 text-slate-500">
                              {event.change_count ?? 0} өөрчлөлт
                            </td>
                            <td className="px-2 py-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                aria-label={`Бүртгэл ${event.id} дэлгэрэнгүй`}
                                onClick={() => setSelectedId(event.id)}
                              >
                                Харах
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <DataPagination
                  page={page}
                  totalItems={data.count}
                  pageSize={data.page_size}
                  itemLabel="бүртгэл"
                  busy={loading}
                  onPageChange={setPage}
                />
              </>
            )
          )}
        </CardContent>
      </Card>
      {selectedId !== null && (
        <EventDetails key={selectedId} eventId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
