'use client';

import Link from 'next/link';
import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdminPortalAccess } from '@/components/admin/admin-shell';

export default function AdminActivitiesLayout({ children }: { children: React.ReactNode }) {
  const access = useAdminPortalAccess();
  if (access.can_manage_settings) return <>{children}</>;

  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center">
      <ShieldX className="mx-auto h-10 w-10 text-slate-400" />
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Тохиргоо удирдах эрхгүй байна</h1>
      <p className="mt-3 text-sm text-slate-500">
        Энэ хэсэгт зөвхөн DB-д бүртгэлтэй админ хэрэглэгч нэвтэрнэ.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/admin">Админ самбар руу буцах</Link>
      </Button>
    </div>
  );
}
