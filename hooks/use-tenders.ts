'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchTenderCatalog, fetchTenderDetail } from '@/lib/api';
import type { Tender } from '@/lib/tender-data';

export function useTenderCatalog(scope: 'all' | 'open' | 'result' | 'saved' = 'all') {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTenders(await fetchTenderCatalog(scope));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Тендерийн мэдээлэл ачаалж чадсангүй.'
      );
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void reload();
  }, [reload]);
  return { tenders, loading, error, reload };
}

export function useTenderDetail(invitationId: number) {
  const [tender, setTender] = useState<Tender | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!Number.isFinite(invitationId) || invitationId <= 0) {
      setError('Тендерийн дугаар буруу байна.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setTender(await fetchTenderDetail(invitationId));
    } catch (requestError) {
      setTender(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Тендерийн мэдээлэл ачаалж чадсангүй.'
      );
    } finally {
      setLoading(false);
    }
  }, [invitationId]);

  useEffect(() => {
    void reload();
  }, [reload]);
  return { tender, loading, error, reload };
}
