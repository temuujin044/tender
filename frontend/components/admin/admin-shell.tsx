'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminAccess } from '@/hooks/use-admin-access';
import type { AdminAccess } from '@/lib/api';
import { AdminSidebar } from './admin-sidebar';
import { EmployeeMain } from '@/components/employee/employee-main';

const AdminAccessContext = createContext<AdminAccess | null>(null);

export function useAdminPortalAccess() {
  const access = useContext(AdminAccessContext);
  if (!access) throw new Error('Admin access context is unavailable.');
  return access;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, access, retry } = useAdminAccess();

  useEffect(() => {
    if (status === 'denied') router.replace('/login?redirect=/admin');
  }, [router, status]);

  if (status === 'checking' || status === 'denied') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-600">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-orange-500" />
        Админ эрх шалгаж байна…
      </div>
    );
  }

  if (status === 'error' || !access) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">Админ эрх шалгаж чадсангүй</h1>
          <p className="mt-2 text-sm text-slate-500">
            Backend холболтоо шалгаад дахин оролдоно уу.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" asChild>
              <Link href="/login?redirect=/admin">Нэвтрэх хуудас</Link>
            </Button>
            <Button onClick={retry}>Дахин шалгах</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!access.can_access_admin) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div>
          <ShieldX className="mx-auto h-10 w-10 text-slate-400" />
          <h1 className="mt-4 text-xl font-semibold">Админ хэсэгт нэвтрэх эрхгүй байна</h1>
        </div>
      </div>
    );
  }

  return (
    <AdminAccessContext.Provider value={access}>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <AdminSidebar access={access} />
        <EmployeeMain>{children}</EmployeeMain>
      </div>
    </AdminAccessContext.Provider>
  );
}
