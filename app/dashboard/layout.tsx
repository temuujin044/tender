import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { AUTH_COOKIE_KEY, AUTH_ROLE_COOKIE_KEY } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  if (cookieStore.get(AUTH_COOKIE_KEY)?.value !== 'true') redirect('/login?redirect=/dashboard');
  const role = cookieStore.get(AUTH_ROLE_COOKIE_KEY)?.value;
  if (role === 'admin') redirect('/admin');
  if (role === 'employee') redirect('/employee');
  return (
    <div className="flex h-screen overflow-hidden">
      <DashboardSidebar />
      <main className="h-screen min-w-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
    </div>
  );
}
