'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export function EmployeeMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pathname]);

  return (
    <main ref={mainRef} className="h-screen min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
      {children}
    </main>
  );
}
