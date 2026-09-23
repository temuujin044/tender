'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ApiError, fetchAuditAccess } from '@/lib/api';
import { AUTH_STATE_EVENT, getStoredUser } from '@/lib/auth';

export function useAuditAccess() {
  const pathname = usePathname();
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied' | 'error'>('checking');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let controller: AbortController | undefined;
    const check = () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      setStatus('checking');
      if (!getStoredUser()?.token) {
        setStatus('denied');
        return;
      }
      void fetchAuditAccess(signal)
        .then((result) => {
          if (!signal.aborted) setStatus(result.can_view_audit ? 'allowed' : 'denied');
        })
        .catch((error: unknown) => {
          if (!signal.aborted) {
            setStatus(
              error instanceof ApiError && [401, 403].includes(error.status) ? 'denied' : 'error'
            );
          }
        });
    };
    check();
    window.addEventListener(AUTH_STATE_EVENT, check);
    window.addEventListener('storage', check);
    window.addEventListener('focus', check);
    return () => {
      controller?.abort();
      window.removeEventListener(AUTH_STATE_EVENT, check);
      window.removeEventListener('storage', check);
      window.removeEventListener('focus', check);
    };
  }, [pathname, revision]);

  return { status, retry: () => setRevision((value) => value + 1) };
}
