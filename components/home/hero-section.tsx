"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hero3DScene } from "./hero-3d-scene";

export function HeroSection() {
  return (
    <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden pb-20 pt-10 lg:pb-24 lg:pt-14">
      {/* 3D Scene Background */}
      <Hero3DScene />
      
      {/* Dark overlay for contrast */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#070b14_100%)] opacity-80 pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
           className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-black/40 px-5 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#e0a97c] shadow-sm backdrop-blur-md"
        >
          <Sparkles className="h-4 w-4 text-[#d28a45]" />
          Шинэчлэгдсэн тендерийн орчин
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="text-balance text-5xl font-extrabold tracking-tight text-white sm:text-7xl"
        >
          Таны бизнесийн 
          <span className="block mt-2 bg-gradient-to-r from-[#d28a45] to-[#ffd1a8] bg-clip-text text-transparent drop-shadow-sm">
            шинэ эхлэл
          </span>
        </motion.h1>

        <motion.p
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
           className="mx-auto mt-8 max-w-2xl text-lg text-slate-300 leading-relaxed font-light"
        >
          МАК ХХК-ийн цахим тендерийн платформд тавтай морил. Хамгийн сүүлийн үеийн
          боломжуудыг ашиглан бизнесийн үнэ цэнээ нэмэгдүүлээрэй.
        </motion.p>

        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mt-12 flex flex-col items-center justify-center gap-5 sm:flex-row"
        >
          <Link href="/tenders/open">
            <Button
              size="lg"
              className="group h-14 rounded-full bg-gradient-to-r from-[#d28a45] to-[#b87635] px-8 text-white text-base shadow-[0_0_40px_-10px_rgba(210,138,69,0.5)] hover:shadow-[0_0_60px_-15px_rgba(210,138,69,0.7)] transition-all border-none"
            >
              Тендерүүд үзэх
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
          <Link href="/register">
            <Button
              size="lg"
              variant="outline"
              className="h-14 rounded-full border border-white/20 bg-white/5 px-8 text-white text-base backdrop-blur-md hover:bg-white/10 hover:border-white/30 transition-all"
            >
              Нийлүүлэгчээр бүртгүүлэх
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
