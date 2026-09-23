'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function NewEmployeeTenderPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/employee/tenders/0');
  }, [router]);
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-orange-500" />
        <p className="mt-3 text-sm text-slate-500">Шинэ тендерийн form нээж байна...</p>
      </div>
    </div>
  );
}
