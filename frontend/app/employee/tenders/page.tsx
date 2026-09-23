'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronRight, FilePlus2, Files, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DataPagination } from '@/components/data-pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  formatEmployeeMoney,
  invitationStatusLabels,
  getTenderCompletion,
  type EmployeeTender,
  type EmployeeTenderStatus,
} from '@/lib/employee-tender';
import {
  fetchEmployeeTenders,
  fetchMyEmployeePermission,
  type EmployeePermission,
} from '@/lib/api';

const status: Record<EmployeeTenderStatus, { label: string; className: string }> = {
  draft: { label: 'Ноорог', className: 'bg-slate-100 text-slate-700' },
  ready: { label: 'Бэлэн', className: 'bg-blue-100 text-blue-700' },
  published: { label: 'Нийтэлсэн', className: 'bg-emerald-100 text-emerald-700' },
  closed: { label: 'Хаагдсан', className: 'bg-violet-100 text-violet-700' },
};

export default function EmployeeTenderListPage() {
  const [tenders, setTenders] = useState<EmployeeTender[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [permission, setPermission] = useState<EmployeePermission | null>(null);
  useEffect(() => {
    void Promise.all([fetchEmployeeTenders(), fetchMyEmployeePermission()]).then(
      ([rows, currentPermission]) => {
        setTenders(rows);
        setPermission(currentPermission);
      }
    );
  }, []);
  const canManageTender = Boolean(permission?.isAdmin || permission?.isTenderManage);
  const filtered = useMemo(
    () =>
      tenders.filter(
        (item) =>
          `${item.name} ${item.tenderCode} ${item.invitationCode}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (filter === 'all' || item.status === filter)
      ),
    [filter, query, tenders]
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleTenders = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Тендерүүд</h1>
            <p className="mt-2 text-slate-500">
              Төсөл, урилга болон нийтлэгдсэн тендерийн мэдээллийг удирдана.
            </p>
          </div>
          {canManageTender && (
            <Link href="/employee/tenders/new">
              <Button className="bg-orange-500 hover:bg-orange-600">
                <FilePlus2 className="mr-2 h-4 w-4" />
                Тендер үүсгэх
              </Button>
            </Link>
          )}
        </div>
        <Card className="mt-8 border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Тендерийн нэр, кодоор хайх"
                  className="pl-9"
                />
              </div>
              <Select
                value={filter}
                onValueChange={(value) => {
                  setFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Бүх төлөв</SelectItem>
                  <SelectItem value="draft">Ноорог</SelectItem>
                  <SelectItem value="ready">Бэлэн</SelectItem>
                  <SelectItem value="published">Нийтэлсэн</SelectItem>
                  <SelectItem value="closed">Хаагдсан</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length ? (
              <>
                <div className="divide-y divide-slate-100">
                  {visibleTenders.map((tender) => {
                    const completion = getTenderCompletion(tender);
                    return (
                      <Link
                        href={`/employee/tenders/${tender.id}`}
                        key={tender.id}
                        className="group grid gap-5 p-6 hover:bg-slate-50 lg:grid-cols-[minmax(0,1fr)_180px_160px_36px] lg:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={status[tender.status].className}>
                              {invitationStatusLabels[tender.invitationStatusId ?? -1] ??
                                status[tender.status].label}
                            </Badge>
                            <span className="text-xs font-medium text-slate-500">
                              {tender.tenderCode}
                            </span>
                            <span className="text-xs text-slate-400">{tender.invitationCode}</span>
                          </div>
                          <h2 className="mt-2 truncate font-semibold text-slate-900">
                            {tender.name || 'Нэр өгөөгүй тендер'}
                          </h2>
                          <p className="mt-1 text-sm text-slate-500">
                            {tender.department || 'Хэлтэс сонгоогүй'} •{' '}
                            {tender.tenderType || 'Төрөл сонгоогүй'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Төсөвт өртөг</p>
                          <p className="mt-1 font-semibold text-slate-900">
                            {formatEmployeeMoney(tender.budget)}
                          </p>
                          {tender.acceptDate && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                              <CalendarDays className="h-3 w-3" />
                              {tender.acceptDate.replace('T', ' ')}
                            </p>
                          )}
                        </div>
                        <div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Бүрдүүлэлт</span>
                            <span className="font-semibold">
                              {completion.completed}/{completion.total}
                            </span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-orange-500"
                              style={{ width: `${completion.percent}%` }}
                            />
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-orange-500" />
                      </Link>
                    );
                  })}
                </div>
                <DataPagination
                  page={page}
                  pageSize={pageSize}
                  totalItems={filtered.length}
                  itemLabel="тендер"
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              </>
            ) : (
              <div className="py-20 text-center">
                <Files className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 font-medium text-slate-700">Тохирох тендер олдсонгүй</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
