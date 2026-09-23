import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { AUTH_COOKIE_KEY, AUTH_ROLE_COOKIE_KEY } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  if (cookieStore.get(AUTH_COOKIE_KEY)?.value !== 'true') redirect('/login?redirect=/admin');
  if (cookieStore.get(AUTH_ROLE_COOKIE_KEY)?.value !== 'admin') {
    redirect('/login?redirect=/admin');
  }
  return <AdminShell>{children}</AdminShell>;
}
