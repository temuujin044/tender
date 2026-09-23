'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthState } from '@/hooks/use-auth-state';
import { getLoginRedirectPath } from '@/lib/auth';

interface TenderAccessGuardProps {
  children: ReactNode;
  redirectPath: string;
}

export function TenderAccessGuard({ children, redirectPath }: TenderAccessGuardProps) {
  const router = useRouter();
  const { isAuthenticated, isReady } = useAuthState();

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace(getLoginRedirectPath(redirectPath));
    }
  }, [isAuthenticated, isReady, redirectPath, router]);

  if (!isReady) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <Card className="w-full max-w-md border-border/60">
          <CardContent className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Lock className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">Нэвтрэх шаардлагатай</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Энэ төрлийн тендерийг харахын тулд эхлээд системд нэвтэрнэ үү.
            </p>
            <Link href={getLoginRedirectPath(redirectPath)} className="mt-6 block">
              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                Нэвтрэх
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
