'use client';

import Link from 'next/link';
import { History, ListTree, Settings, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminPortalAccess } from '@/components/admin/admin-shell';

export default function AdminPage() {
  const access = useAdminPortalAccess();
  const sections = [
    {
      title: 'Тохиргоо',
      description: 'Тендерийн үйлдлийн эрх болон хорооны гишүүний тохиргоог удирдана.',
      href: '/admin/settings',
      icon: Settings,
      visible: access.can_manage_settings,
    },
    {
      title: 'Үйл ажиллагааны чиглэл',
      description:
        'Нийлүүлэгч бүртгэл болон профайл дээр сонгох үйл ажиллагааны чиглэлийг удирдана.',
      href: '/admin/activities',
      icon: ListTree,
      visible: access.can_manage_settings,
    },
    {
      title: 'Үйлдлийн түүх',
      description: 'Хэрэглэгчдийн хийсэн бизнес үйлдэл, өөрчлөлтийн түүхийг хянана.',
      href: '/admin/logs',
      icon: History,
      visible: access.can_view_audit,
    },
  ].filter((section) => section.visible);

  return (
    <div className="min-h-full bg-slate-50 p-6 pt-20 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-600">
            <ShieldCheck className="h-4 w-4" /> Админ удирдлага
          </div>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Удирдлагын хэсэг</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">
            Танд олгогдсон эрхийн хүрээнд тохиргоо болон үйлдлийн түүх рүү нэвтэрнэ.
          </p>
        </header>

        <section className="mt-8 grid gap-5 md:grid-cols-2">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Link key={section.href} href={section.href} className="group">
                <Card className="h-full border-slate-200 transition-all group-hover:-translate-y-0.5 group-hover:border-orange-200 group-hover:shadow-md">
                  <CardHeader>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <CardTitle className="pt-2 text-xl">{section.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-6 text-slate-500">
                    {section.description}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </section>
      </div>
    </div>
  );
}
