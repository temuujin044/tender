'use client';

import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { TenderList } from '@/components/tenders/tender-list';
import { Button } from '@/components/ui/button';
import { useTenderCatalog } from '@/hooks/use-tenders';

export function RealOpenTenderList() {
  const { tenders, loading, error, reload } = useTenderCatalog('open');

  if (loading)
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        Backend-ээс нээлттэй тендерүүдийг ачаалж байна...
      </div>
    );
  if (error)
    return (
      <div className="py-20 text-center">
        <AlertCircle className="mx-auto h-9 w-9 text-red-500" />
        <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => void reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Дахин оролдох
        </Button>
      </div>
    );

  return (
    <TenderList
      tenders={tenders}
      title="Нээлттэй тендерүүд"
      description="Одоогоор санал хүлээн авч байгаа бодит тендерийн урилгууд"
      defaultStatus="all"
    />
  );
}
