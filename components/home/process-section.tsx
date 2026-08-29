"use client";

import {
  UserPlus,
  FileSearch,
  Upload,
  Send,
  ClipboardCheck,
  Award,
  ArrowRight,
} from "lucide-react";

const steps = [
  {
    step: "01",
    title: "Бүртгүүлэх",
    description:
      "Компанийн болон холбоо барих мэдээллээ оруулж нийлүүлэгчийн эрх үүсгэнэ",
    icon: UserPlus,
    color: "bg-blue-500/10 text-blue-600",
  },
  {
    step: "02",
    title: "Тендер судлах",
    description: "Нээлттэй тендерийн дэлгэрэнгүй, багц, хугацаа болон шаардлагыг шалгана",
    icon: FileSearch,
    color: "bg-orange-500/10 text-orange-600",
  },
  {
    step: "03",
    title: "Санал бэлтгэх",
    description:
      "Оролцох багцаа сонгож, шаардлагатай материал болон үнийн саналаа оруулна",
    icon: Upload,
    color: "bg-purple-500/10 text-purple-600",
  },
  {
    step: "04",
    title: "Оролцоогоо баталгаажуулах",
    description: "Материал, үнийн саналаа хянаад тендерт оролцох хүсэлтээ хугацаанд нь илгээнэ",
    icon: Send,
    color: "bg-rose-500/10 text-rose-600",
  },
  {
    step: "05",
    title: "Нээлт ба үнэлгээ",
    description:
      "Тендер нээгдэж, санал техникийн болон санхүүгийн шалгуураар шатлан үнэлэгдэнэ",
    icon: ClipboardCheck,
    color: "bg-indigo-500/10 text-indigo-600",
  },
  {
    step: "06",
    title: "Үр дүн",
    description:
      "Шалгарсан эсвэл шалгараагүй эцсийн төлөвөө оролцсон тендерийн хэсгээс харна",
    icon: Award,
    color: "bg-emerald-500/10 text-emerald-600",
  },
];

export function ProcessSection() {
  return (
    <section id="how-it-works" className="relative scroll-mt-16 overflow-hidden bg-background py-20 lg:py-32">
      {/* Чимэглэлийн дэвсгэр эффект */}
      <div className="absolute left-1/2 top-0 -translate-x-1/2 blur-3xl opacity-10 pointer-events-none">
        <div className="aspect-1100/500 w-280 bg-linear-to-tr from-primary to-blue-400"></div>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Хэрхэн ажилладаг вэ?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Худалдан авалтын үйл явцад оролцохын тулд дараах{" "}
            <span className="text-primary font-medium">6 үндсэн алхмыг</span>{" "}
            дагана уу.
          </p>
        </div>

        <div className="mt-20">
          {/* Desktop Layout */}
          <div className="hidden lg:block">
            <div className="relative flex justify-between gap-4">
              {/* Алхмуудыг холбосон арын шугам */}
              <div className="absolute left-0 right-0 top-12 h-0.5 bg-muted-foreground/10" />

              {steps.map((step, index) => (
                <div
                  key={step.step}
                  className="group relative flex flex-1 flex-col items-center text-center transition-all duration-300 hover:-translate-y-2"
                >
                  {/* Икон ба Алхмын дугаар */}
                  <div
                    className={`relative z-10 flex h-24 w-24 items-center justify-center rounded-3xl border-4 border-background bg-card shadow-xl transition-all duration-300 group-hover:shadow-primary/20 group-hover:border-primary/20`}
                  >
                    <step.icon className="h-10 w-10 text-primary transition-transform duration-300 group-hover:scale-110" />
                    <div className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground shadow-lg">
                      {step.step}
                    </div>
                  </div>

                  <h3 className="mt-8 text-lg font-bold text-foreground">
                    {step.title}
                  </h3>

                  <p className="mt-3 px-2 text-sm leading-relaxed text-muted-foreground opacity-90">
                    {step.description}
                  </p>

                  {/* Холбогч сум (Сүүлчийн алхмаас бусад дээр харагдана) */}
                  {index !== steps.length - 1 && (
                    <div className="absolute left-[calc(100%-1.5rem)] top-10 z-20 hidden xl:block">
                      <ArrowRight className="h-5 w-5 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Mobile & Tablet Layout */}
          <div className="relative space-y-8 lg:hidden">
            {/* Босоо шугам (Mobile) */}
            <div className="absolute left-8 top-4 bottom-4 w-0.5 bg-muted-foreground/10 sm:left-12" />

            {steps.map((step) => (
              <div
                key={step.step}
                className="relative flex items-start gap-5 rounded-2xl border border-border/50 bg-card p-6 shadow-sm transition-all active:scale-[0.98] sm:gap-8 sm:p-8"
              >
                <div
                  className={`relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20 sm:h-20 sm:w-20 sm:rounded-3xl`}
                >
                  <step.icon className="h-7 w-7 text-primary-foreground sm:h-10 sm:w-10" />
                  <div className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background sm:h-8 sm:w-8 sm:text-xs">
                    {step.step}
                  </div>
                </div>

                <div className="flex flex-col justify-center">
                  <h3 className="text-lg font-bold text-foreground sm:text-xl">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
