"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { AlertCircle, CheckCircle, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthState } from "@/hooks/use-auth-state";

const stats = [
  {
    label: "Нээлттэй тендер",
    value: "24",
    description: "Санал хүлээн авч байна",
    icon: FileText,
    href: "/tenders/open",
    color: "text-primary",
    bgColor: "bg-primary/10",
    requiresAuth: false,
  },
  {
    label: "Удахгүй хаагдах",
    value: "5",
    description: "7 хоногийн дотор",
    icon: AlertCircle,
    href: "/tenders/open?filter=closing-soon",
    color: "text-amber-600",
    bgColor: "bg-amber-100",
    requiresAuth: false,
  },
  {
    label: "Оролцсон / Үр дүн",
    value: "2",
    description: "Миний илгээсэн саналууд",
    icon: CheckCircle,
    href: "/tenders/closed",
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
    requiresAuth: true,
  },
];

export function StatsSection() {
  const { isAuthenticated, isReady } = useAuthState();
  const visibleStats = stats.filter(
    (stat) => !stat.requiresAuth || (isReady && isAuthenticated),
  );

  return (
    <section className="relative -mt-8 pb-12 pt-2 lg:-mt-12 lg:pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <h2 className="text-lg font-semibold text-primary">
              Ерөнхий мэдээлэл
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Тендерийн одоогийн байдал
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-white/82 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-primary/90 shadow-sm backdrop-blur">
            тендерийн шуурхай төлөв
          </div>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleStats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{
                duration: 0.65,
                delay: index * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <Link href={stat.href}>
                <motion.div whileHover={{ y: -6 }} whileTap={{ scale: 0.985 }}>
                  <Card className="group h-full cursor-pointer overflow-hidden rounded-[1.7rem] border-white/80 bg-white/82 shadow-[0_24px_55px_-34px_rgba(15,23,42,0.28)] backdrop-blur transition-all duration-300 hover:border-primary/60 hover:shadow-[0_28px_60px_-30px_rgba(15,23,42,0.34)]">
                    <CardContent className="relative p-6">
                      <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-primary/90 via-primary/70 to-[#eff4f8]" />
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">
                            {stat.label}
                          </p>
                          <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
                            {stat.value}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {stat.description}
                          </p>
                        </div>
                        <motion.div
                          whileHover={{ rotate: -8, scale: 1.06 }}
                          className={`rounded-2xl p-3 shadow-inner ${stat.bgColor}`}
                        >
                          <stat.icon className={`h-5 w-5 ${stat.color}`} />
                        </motion.div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
