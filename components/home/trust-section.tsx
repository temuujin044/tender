import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, ArrowRight } from "lucide-react";

const supportOptions = [
  {
    title: "И-мэйл илгээх",
    description: "И-мэйл илгээвэл бид 24 цагийн дотор хариу өгнө",
    icon: Mail,
    href: "mailto:procurement@mak.mn",
    action: "И-мэйл илгээх",
  },
];

export function TrustSection() {
  return (
    <section className="py-16 lg:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
            Тусламж хэрэгтэй юу?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Манай тусгай зориулалтын дэмжлэгийн баг худалдан авалтын үйл явцад
            тань туслахад бэлэн байна
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-md">
          {supportOptions.map((option) => (
            <Card
              key={option.title}
              className="group rounded-[1.7rem] border-white/80 bg-white/82 shadow-[0_24px_55px_-34px_rgba(15,23,42,0.24)] backdrop-blur transition-all duration-300 hover:border-primary/50 hover:shadow-[0_28px_60px_-30px_rgba(15,23,42,0.32)]"
            >
              <CardContent className="p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <option.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  {option.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {option.description}
                </p>
                <Link href={option.href} className="mt-4 inline-block">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="group/btn -ml-2 text-primary hover:text-primary"
                  >
                    {option.action}
                    <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="relative mt-16 overflow-hidden rounded-4xl border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(31,41,55,0.92))] p-8 shadow-[0_34px_80px_-36px_rgba(15,23,42,0.5)] sm:p-12">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#d17c38]/16 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/70 to-transparent" />
          <div className="flex flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
            <div>
              <h3 className="text-xl font-semibold text-background sm:text-2xl">
                Эхлэхэд бэлэн үү?
              </h3>
              <p className="mt-2 text-background/70">
                Нийлүүлэгчээр бүртгүүлж тендерт оролцож эхлээрэй
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Link href="/register">
                <Button
                  size="lg"
                  className="bg-primary/80 text-white hover:bg-[#b9642d]"
                >
                  Одоо бүртгүүлэх
                </Button>
              </Link>
              <Link href="/#how-it-works">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-background/20 bg-transparent text-background hover:bg-background/10 hover:text-background"
                >
                  Дэлгэрэнгүй
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
