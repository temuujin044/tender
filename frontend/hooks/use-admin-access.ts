'use client';

import { useEffect, useState } from 'react';
import { ApiError, fetchAdminAccess, type AdminAccess } from '@/lib/api';
import { AUTH_STATE_EVENT, getStoredUser } from '@/lib/auth';

type AccessStatus = 'checking' | 'allowed' | 'denied' | 'error';

export function useAdminAccess() {
  const [status, setStatus] = useState<AccessStatus>('checking');
  const [access, setAccess] = useState<AdminAccess | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let controller: AbortController | undefined;
    const check = () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      setStatus('checking');
      setAccess(null);

      const user = getStoredUser();
      if (!user?.token || user.role !== 'admin') {
        setStatus('denied');
        return;
      }

      void fetchAdminAccess(signal)
        .then((result) => {
          if (signal.aborted) return;
          setAccess(result);
          setStatus(result.can_access_admin ? 'allowed' : 'denied');
        })
        .catch((error: unknown) => {
          if (signal.aborted) return;
          setStatus(
            error instanceof ApiError && [401, 403].includes(error.status) ? 'denied' : 'error'
          );
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
  }, [revision]);

  return { status, access, retry: () => setRevision((value) => value + 1) };
}
