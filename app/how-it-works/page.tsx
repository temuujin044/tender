import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { ProcessSection } from "@/components/home/process-section";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Shield,
  Clock,
  Users,
  FileCheck,
  Award,
  Headphones,
  ArrowRight,
} from "lucide-react";

export const metadata = {
  title: "Хэрхэн ажилладаг вэ - МАК Тендер",
  description:
    "МАК Тендер платформ дээр тендерт хэрхэн оролцох, худалдан авалтын үйл явцыг хэрхэн ашиглах талаар танилцана уу.",
};

const benefits = [
  {
    icon: Shield,
    title: "Аюулгүй, ил тод",
    description:
      "Тендерийн бүх үйл явц аюулгүй, хяналт шалгалтад нээлттэй бөгөөд оролцогч бүрт ил тод байна.",
  },
  {
    icon: Clock,
    title: "Бодит цагийн мэдээлэл",
    description:
      "Төлөвийн өөрчлөлт, эцсийн хугацаа, үр дүнгийн талаар шуурхай мэдэгдэл аваарай.",
  },
  {
    icon: Users,
    title: "Тэгш боломж",
    description:
      "Шаардлага хангасан бүх нийлүүлэгчид ижил боломж олгох шударга үнэлгээний үйл явц.",
  },
  {
    icon: FileCheck,
    title: "Хялбаршуулсан процесс",
    description:
      "Манай дижитал платформоор дамжуулан баримт бичиг илгээх, санал удирдах ажлыг хялбарчилна.",
  },
  {
    icon: Award,
    title: "Чадамжид суурилсан сонголт",
    description:
      "Нийлүүлэгчийг техникийн чадавх, үнийн санал, ажлын туршлагад үндэслэн сонгоно.",
  },
  {
    icon: Headphones,
    title: "Тусгай дэмжлэг",
    description:
      "Манай худалдан авалтын баг үйл явцын турш танд туслахад бэлэн байна.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />

      <main className="flex-1">
        {/* Process Steps */}
        <ProcessSection />

        {/* Benefits */}
        <section className="py-10 lg:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {benefits.map((benefit) => (
                <Card key={benefit.title} className="border-border/60">
                  <CardContent className="p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                      <benefit.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">
                      {benefit.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {benefit.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-foreground py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
              <div>
                <h2 className="text-2xl font-semibold text-background">
                  Эхлэхэд бэлэн үү?
                </h2>
                <p className="mt-2 text-background/70">
                  Нийлүүлэгчээр бүртгүүлж, тендерт оролцож эхлээрэй
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                <Link href="/register">
                  <Button
                    size="lg"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Одоо бүртгүүлэх
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/tenders/open">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-background/20 bg-transparent text-background hover:bg-background/10 hover:text-background"
                  >
                    Тендерүүд үзэх
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* <Footer /> */}
    </div>
  );
}
