'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, FileText, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTenderCatalog } from '@/hooks/use-tenders';
import { Hero3DScene } from './hero-3d-scene';

export function HeroSection() {
  const { tenders, loading } = useTenderCatalog('open');

  return (
    <section className="relative flex min-h-[calc(100vh-4rem)] w-full min-w-0 items-center overflow-hidden bg-[#faf8f4] py-12 sm:py-16 lg:py-24">
      <Hero3DScene />

      <div className="pointer-events-none absolute left-[-12rem] top-20 h-96 w-96 rounded-full bg-orange-200/30 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-background to-transparent" />

      <div className="relative z-10 mx-auto grid w-full min-w-0 max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)] lg:px-8">
        <div className="min-w-0 max-w-2xl text-center lg:text-left">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="mb-7 inline-flex max-w-full items-center justify-center gap-2 rounded-full border border-orange-200 bg-white/90 px-3 py-2 text-center text-xs font-semibold uppercase tracking-normal text-orange-700 shadow-[0_10px_30px_-18px_rgba(234,88,12,0.65)] backdrop-blur-md sm:px-4"
          >
            <Sparkles className="h-4 w-4 text-orange-500" />
            Шинэчлэгдсэн тендерийн орчин
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-full text-balance text-4xl font-extrabold tracking-normal text-slate-950 sm:text-6xl xl:text-7xl"
          >
            Таны бизнесийн
            <span className="mt-2 block bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 bg-clip-text text-transparent">
              шинэ эхлэл
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-7 max-w-xl text-base font-normal leading-7 text-slate-600 sm:text-lg sm:leading-8 lg:mx-0"
          >
            МАК ХХК-ийн цахим тендерийн платформд тавтай морил. Шинэ боломжийг ил тод, хялбар үйл
            явцаар нээж, бизнесийн үнэ цэнээ нэмэгдүүлээрэй.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start"
          >
            <Link href="#open-tenders">
              <Button
                size="lg"
                className="group h-14 rounded-full border-none bg-gradient-to-r from-orange-500 to-orange-600 px-8 text-base text-white shadow-[0_18px_35px_-16px_rgba(234,88,12,0.8)] transition-all hover:-translate-y-0.5 hover:from-orange-600 hover:to-orange-700 hover:shadow-[0_22px_40px_-16px_rgba(234,88,12,0.9)]"
              >
                Тендерүүд үзэх
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link href="/register">
              <Button
                size="lg"
                variant="outline"
                className="h-14 rounded-full border border-slate-300 bg-white/90 px-8 text-base text-slate-700 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
              >
                Нийлүүлэгчээр бүртгүүлэх
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.45 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-slate-600 lg:justify-start"
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Ил тод үйл явц
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-orange-600" />
              Найдвартай орчин
            </span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 30, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none relative hidden h-[540px] lg:block"
        >
          <div className="absolute right-0 top-16 rounded-2xl border border-white/80 bg-white/85 p-4 shadow-[0_24px_55px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                <FileText className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs text-slate-500">Нээлттэй тендер</p>
                <p className="text-xl font-bold text-slate-900">
                  {loading ? '...' : tenders.length}
                </p>
              </div>
            </div>
          </div>
          <div className="absolute bottom-20 left-2 rounded-2xl border border-white/80 bg-white/85 p-4 shadow-[0_24px_55px_-24px_rgba(15,23,42,0.3)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-slate-900">Аюулгүй, ил тод</p>
                <p className="text-xs text-slate-500">Нэгдсэн худалдан авалт</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
