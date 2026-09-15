'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { TenderList } from '@/components/tenders/tender-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTenderCatalog } from '@/hooks/use-tenders';
import type { ActivityDiscoveryScope } from '@/lib/api';

export function RealOpenTenderList() {
  const [discoveryScope, setDiscoveryScope] = useState<ActivityDiscoveryScope>('matching');
  const { tenders, loading, error, reload } = useTenderCatalog('open', discoveryScope);

  const scopeSelector = (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <Tabs
        value={discoveryScope}
        onValueChange={(value) => setDiscoveryScope(value as ActivityDiscoveryScope)}
      >
        <TabsList className="grid w-full grid-cols-2 sm:w-[420px]">
          <TabsTrigger value="matching">Миний чиглэлийн тендер</TabsTrigger>
          <TabsTrigger value="all">Бүх нээлттэй тендер</TabsTrigger>
        </TabsList>
      </Tabs>
      <p className="mt-2 text-xs text-muted-foreground">
        {discoveryScope === 'matching'
          ? 'Таны профайлд сонгосон үйл ажиллагааны чиглэлтэй тохирох тендерүүд.'
          : 'Оролцох боломжтой бүх нээлттэй тендер. Чиглэлийн тохирол нь нэвтрэх эрхийг хязгаарлахгүй.'}
      </p>
    </div>
  );

  if (loading)
    return (
      <div className="space-y-5">
        {scopeSelector}
        <div className="flex min-h-[45vh] items-center justify-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          Backend-ээс нээлттэй тендерүүдийг ачаалж байна...
        </div>
      </div>
    );
  if (error)
    return (
      <div className="space-y-5">
        {scopeSelector}
        <div className="py-20 text-center">
          <AlertCircle className="mx-auto h-9 w-9 text-red-500" />
          <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Дахин оролдох
          </Button>
        </div>
      </div>
    );

  if (discoveryScope === 'matching' && tenders.length === 0)
    return (
      <div className="space-y-5">
        {scopeSelector}
        <Card className="border-border/60">
          <CardContent className="py-14 text-center">
            <p className="font-medium">
              Таны үйл ажиллагааны чиглэлд тохирох нээлттэй тендер алга.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Профайлын чиглэлээ шинэчлэх эсвэл бүх нээлттэй тендерийг харж болно.
            </p>
            <Button className="mt-5" onClick={() => setDiscoveryScope('all')}>
              Бүх нээлттэй тендер харах
            </Button>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="space-y-5">
      {scopeSelector}
      <TenderList
        tenders={tenders}
        title="Нээлттэй тендерүүд"
        description="Одоогоор санал хүлээн авч байгаа бодит тендерийн урилгууд"
        defaultStatus="all"
      />
    </div>
  );
}
