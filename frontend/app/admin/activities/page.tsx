'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ListTree, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  deleteVendorActivity,
  fetchVendorActivities,
  saveVendorActivity,
  type VendorActivity,
} from '@/lib/api';

export default function VendorActivitiesPage() {
  const [activities, setActivities] = useState<VendorActivity[]>([]);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<VendorActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setActivities(await fetchVendorActivities());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Үйл ажиллагааны чиглэлүүдийг ачаалж чадсангүй.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('mn');
    if (!normalized) return activities;
    return activities.filter((activity) =>
      activity.activity.toLocaleLowerCase('mn').includes(normalized)
    );
  }, [activities, query]);

  const resetForm = () => {
    setName('');
    setEditingId(null);
  };

  const save = async () => {
    const normalized = name.trim();
    if (!normalized) {
      setError('Үйл ажиллагааны чиглэлийн нэрийг оруулна уу.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await saveVendorActivity(normalized, editingId ?? -1);
      setNotice(editingId ? 'Үйл ажиллагааны чиглэл шинэчлэгдлээ.' : 'Шинэ чиглэл нэмэгдлээ.');
      resetForm();
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Чиглэлийг хадгалж чадсангүй.'
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
      await deleteVendorActivity(deleteTarget.activityid);
      setNotice('Үйл ажиллагааны чиглэл устгагдлаа.');
      if (editingId === deleteTarget.activityid) resetForm();
      setDeleteTarget(null);
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Чиглэлийг устгаж чадсангүй.'
      );
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-50 p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="pl-11 sm:pl-0">
          <p className="text-xs font-semibold uppercase text-orange-600">АДМИН УДИРДЛАГА</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">
            Үйл ажиллагааны чиглэл
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">
            Нийлүүлэгч бүртгүүлэхдээ сонгох үйл ажиллагааны чиглэлүүдийг энд удирдана.
          </p>
        </header>

        {error && (
          <Alert variant="destructive" className="mt-6 bg-white">
            <ListTree />
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

        <div className="mt-7 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Card className="h-fit border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                {editingId ? <Pencil className="size-4" /> : <Plus className="size-4" />}
                {editingId ? 'Чиглэл засах' : 'Шинэ чиглэл нэмэх'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="activity-name">Чиглэлийн нэр</Label>
                <Input
                  id="activity-name"
                  value={name}
                  maxLength={200}
                  placeholder="Жишээ: Барилга угсралт"
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void save();
                    }
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void save()} disabled={saving} className="flex-1">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Хадгалах
                </Button>
                {editingId && (
                  <Button variant="outline" onClick={resetForm} disabled={saving}>
                    Болих
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg">Бүртгэлтэй чиглэлүүд</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">Нийт {activities.length} сонголт</p>
                </div>
                <div className="relative sm:w-72">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Чиглэл хайх"
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-3 p-6">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Skeleton key={index} className="h-10 w-full" />
                  ))}
                </div>
              ) : filtered.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Чиглэлийн нэр</TableHead>
                      <TableHead className="w-28 text-right">Үйлдэл</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((activity) => (
                      <TableRow key={activity.activityid}>
                        <TableCell className="font-medium">{activity.activity}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`${activity.activity} засах`}
                              onClick={() => {
                                setEditingId(activity.activityid);
                                setName(activity.activity);
                                setError('');
                                setNotice('');
                              }}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`${activity.activity} устгах`}
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => setDeleteTarget(activity)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Empty className="min-h-56">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ListTree />
                    </EmptyMedia>
                    <EmptyTitle>Чиглэл олдсонгүй</EmptyTitle>
                    <EmptyDescription>
                      Хайлтын утгаа өөрчлөх эсвэл шинэ чиглэл нэмнэ үү.
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
            <AlertDialogTitle>Үйл ажиллагааны чиглэл устгах уу?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.activity}” чиглэлийг нийлүүлэгч эсвэл тендер ашиглаж байгаа бол устгах
              боломжгүй.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Болих</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void remove()}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Устгах
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
