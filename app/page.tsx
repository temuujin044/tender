import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { HeroSection } from '@/components/home/hero-section';
import { ProcessSection } from '@/components/home/process-section';
import { TenderTable } from '@/components/home/tender-table';
import { AUTH_COOKIE_KEY, AUTH_ROLE_COOKIE_KEY } from '@/lib/auth';

export default async function HomePage() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get(AUTH_COOKIE_KEY)?.value === 'true';
  const role = cookieStore.get(AUTH_ROLE_COOKIE_KEY)?.value;

  if (isAuthenticated) {
    redirect(role === 'admin' ? '/admin' : role === 'employee' ? '/employee' : '/dashboard');
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip bg-background">
      <Navigation />

      <main className="relative flex-1">
        <HeroSection />
        <TenderTable />
        <ProcessSection />
      </main>
      <Footer />
    </div>
  );
}
