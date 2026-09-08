import { cookies } from 'next/headers';

import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { Footer } from '@/components/footer';
import { Navigation } from '@/components/navigation';
import { AUTH_COOKIE_KEY } from '@/lib/auth';

export default async function TendersLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get(AUTH_COOKIE_KEY)?.value === 'true';

  if (isAuthenticated) {
    return (
      <div className="flex h-screen overflow-hidden bg-[#f8f6f0]">
        <DashboardSidebar />
        <main className="h-screen min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
