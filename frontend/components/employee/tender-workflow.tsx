'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchTenderWorkflow, performTenderAction, type TenderWorkflow } from '@/lib/api';

const actions: Record<string, string> = {
  request_publish: 'Нийтлэх хүсэлт илгээх',
  publish: 'Зөвшөөрч нийтлэх',
  return_draft: 'Ноорогт буцаах',
  open: 'Саналуудыг нээх',
  finish: 'Үр дүн нийтлэх',
  cancel: 'Тендер цуцлах',
  request_republish: 'Дахин зарлах хүсэлт',
  republish: 'Зөвшөөрч шинэ ноорог үүсгэх',
  return_republish: 'Дахин зарлах хүсэлтийг буцаах',
  extend: 'Хугацаа сунгах',
  decide: 'Эцсийн шийдвэр',
};
const vendorStates: Record<number, string> = {
  0: 'Ноорог',
  2: 'Санал илгээсэн',
  3: 'Үнэлж байгаа',
  4: 'Шалгараагүй',
  5: 'Шалгарсан',
};

export function TenderWorkflowPanel({
  invitationId,
  onStateChange,
  hasUnsavedChanges = false,
}: {
  invitationId: number;
  onStateChange: (editable: boolean, status?: number) => void;
  hasUnsavedChanges?: boolean;
}) {
  const router = useRouter();
  const [workflow, setWorkflow] = useState<TenderWorkflow | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    action: string;
    vendorid?: number;
    decision?: number;
    name?: string;
  } | null>(null);
  const [note, setNote] = useState('');
  const [acceptdate, setAcceptdate] = useState('');
  const [opendate, setOpendate] = useState('');
  const reload = useCallback(async () => {
    const value = await fetchTenderWorkflow(invitationId);
    setWorkflow(value);
    onStateChange(value.editable, value.status);
  }, [invitationId, onStateChange]);
  useEffect(() => {
    let active = true;
    setWorkflow(null);
    onStateChange(false);
    fetchTenderWorkflow(invitationId)
      .then((value) => {
        if (active) {
          setWorkflow(value);
          onStateChange(value.editable, value.status);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Төлөв ачаалж чадсангүй.');
      });
    return () => {
      active = false;
    };
  }, [invitationId, onStateChange]);
  const submit = async () => {
    if (!pending) return;
    if (pending.action === 'cancel' && !note.trim()) {
      setError('Тендер цуцлах шалтгаан, тайлбарыг оруулна уу.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await performTenderAction(invitationId, {
        ...pending,
        note: pending.action === 'cancel' ? note.trim() : undefined,
        acceptdate,
        opendate,
      });
      setPending(null);
      setNote('');
      if (result.new_invitationid) router.push(`/employee/tenders/${result.new_invitationid}`);
      else await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Үйлдэл амжилтгүй.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mb-5">
      <CardHeader className="py-4">
        <CardTitle className="flex flex-wrap items-center gap-3 text-base">
          Урилгын явц <Badge variant="secondary">{workflow?.label ?? 'Ачаалж байна…'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {workflow?.editable && (
          <p className="text-sm text-muted-foreground">
            Мэдээллээ бүрэн хадгалсны дараа нийтлэх хүсэлт илгээнэ үү.
          </p>
        )}
        {hasUnsavedChanges && (
          <p className="text-sm text-amber-700">
            Хадгалаагүй өөрчлөлт байна. Эхлээд нооргоо хадгална уу.
          </p>
        )}
        {workflow && !workflow.editable && (
          <p className="text-sm text-muted-foreground">
            Урилгын мэдээлэл түгжигдсэн. Зөвшөөрөгдсөн үйлдлийг доороос сонгоно уу.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {workflow?.actions
            .filter((a) => a !== 'decide')
            .map((action) => (
              <Button
                key={action}
                size="sm"
                variant={action === 'cancel' ? 'destructive' : 'outline'}
                disabled={busy || hasUnsavedChanges}
                onClick={() => {
                  setNote('');
                  setError('');
                  setPending({ action });
                }}
              >
                {actions[action]}
              </Button>
            ))}
        </div>
        {workflow?.identitiesSealed && workflow.submissionSummary && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Ирүүлсэн санал</p>
                <p className="mt-1 text-xs text-slate-500">
                  Нийлүүлэгчийн нэр санал нээх хүртэл нууц байна.
                </p>
              </div>
              <Badge variant="secondary">
                Нийт {workflow.submissionSummary.totalCompanies} компани
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {workflow.submissionSummary.batches.map((batch) => (
                <div
                  key={batch.batchid}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {batch.name || 'Нэргүй багц'}
                    </p>
                    {batch.code && <p className="text-xs text-slate-500">{batch.code}</p>}
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {batch.companyCount} компани
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
        {workflow && workflow.vendors.length > 0 && (
          <div className="divide-y rounded-md border">
            {workflow.vendors.map((v) => (
              <div key={v.vendorid} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-40 flex-1">
                  {v.name}
                  <span className="block text-xs text-muted-foreground">{v.note}</span>
                </span>
                <Badge variant="secondary">{vendorStates[v.status] ?? 'Бүртгэгдээгүй'}</Badge>
                {workflow.actions.includes('decide') && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setNote('');
                        setPending({
                          action: 'decide',
                          vendorid: v.vendorid,
                          decision: 5,
                          name: v.name,
                        });
                      }}
                    >
                      Шалгаруулах
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setNote('');
                        setPending({
                          action: 'decide',
                          vendorid: v.vendorid,
                          decision: 4,
                          name: v.name,
                        });
                      }}
                    >
                      Шалгаруулахгүй
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <Dialog
          open={Boolean(pending)}
          onOpenChange={(open) => {
            if (!open && !busy) setPending(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{pending && actions[pending.action]}</DialogTitle>
              <DialogDescription>
                {pending?.name
                  ? `${pending.name}: ${pending.decision === 5 ? 'шалгаруулах' : 'шалгаруулахгүй'}.`
                  : 'Үйлдлийг баталгаажуулна уу. Төлөв болон эрхийг дахин шалгана.'}
              </DialogDescription>
            </DialogHeader>
            {pending?.action === 'cancel' && (
              <div className="space-y-2">
                <Label htmlFor="workflow-note">Цуцлах шалтгаан, тайлбар</Label>
                <Textarea
                  id="workflow-note"
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Тендер цуцалж байгаа шалтгааныг оруулна уу"
                  disabled={busy}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Заавал оруулна · 500 тэмдэгтээс ихгүй
                </p>
              </div>
            )}
            {pending?.action === 'extend' && (
              <>
                <Label htmlFor="workflow-accept">Санал авах шинэ хугацаа (Улаанбаатар)</Label>
                <Input
                  id="workflow-accept"
                  type="datetime-local"
                  value={acceptdate}
                  onChange={(e) => setAcceptdate(e.target.value)}
                  disabled={busy}
                />
                <Label htmlFor="workflow-open">Санал нээх шинэ хугацаа (Улаанбаатар)</Label>
                <Input
                  id="workflow-open"
                  type="datetime-local"
                  value={opendate}
                  onChange={(e) => setOpendate(e.target.value)}
                  disabled={busy}
                />
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>
                Болих
              </Button>
              <Button disabled={busy} onClick={() => void submit()}>
                {busy ? 'Хадгалж байна…' : 'Баталгаажуулах'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
