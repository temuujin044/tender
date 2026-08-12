import { Navigation } from "@/components/navigation";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  MessageSquare,
  FileQuestion,
  Users,
  Search,
} from "lucide-react";

export const metadata = {
  title: "Тусламж - МАК Тендер",
  description:
    "МАК Тендер худалдан авалтын платформын тусламж мэдээллийг аваарай. Дэмжлэгийн багтай холбогдох эсвэл түгээмэл асуултуудыг үзнэ үү.",
};

const faqs = [
  {
    question: "Нийлүүлэгчээр хэрхэн бүртгүүлэх вэ?",
    answer:
      "Нүүр хуудасны 'Бүртгүүлэх' товчийг дарж, компанийн мэдээлэл, холбоо барих мэдээллээ оруулаад олон алхамт бүртгэлийн маягтыг бөглөнө.",
  },
  {
    question: "Санал илгээхэд ямар баримт бичиг шаардлагатай вэ?",
    answer:
      "Шаардлагатай баримт бичиг нь тендер бүрээс хамаарч өөр байна. Ихэвчлэн компанийн бүртгэл, татварын тодорхойлолт, холбогдох тусгай зөвшөөрөл, техникийн болон үнийн саналыг шаарддаг. Нарийвчилсан жагсаалтыг тухайн тендерийн баримт бичгийн хэсгээс шалгана уу.",
  },
  {
    question: "Үнэлгээний процесс хэр хугацаанд үргэлжилдэг вэ?",
    answer:
      "Үнэлгээний хугацаа нь тендерийн цар хүрээ, төвөгшлөөс шалтгаална. Ихэнх тохиолдолд санал хүлээн авах хугацаа дууссанаас хойш 2-4 долоо хоног үргэлжилнэ. Тодорхой огноог тухайн тендерийн хугацааны хуваариас харна уу.",
  },
  {
    question: "Санал илгээсний дараа өөрчлөх боломжтой юу?",
    answer:
      "Илгээсэн саналыг шууд засах боломжгүй. Гэхдээ эцсийн хугацаа дуусаагүй бол өмнөх саналаа татан авч, шинэ санал дахин илгээж болно.",
  },
  {
    question: "Тендерийн үр дүнг хэрхэн мэдэх вэ?",
    answer:
      "Үр дүн гармагц танд и-мэйл болон платформ доторх мэдэгдлээр мэдээлнэ. Мөн үр дүн тухайн тендерийн дэлгэрэнгүй хуудсанд нийтлэгдэнэ.",
  },
  {
    question: "Санал хүлээн авах хугацаанаас хоцорвол яах вэ?",
    answer:
      "Хугацаа хоцорсон саналыг ямар ч тохиолдолд хүлээн авахгүй. Техникийн эрсдэлээс сэргийлж саналаа эцсийн хугацаанаас дор хаяж 24 цагийн өмнө илгээхийг зөвлөж байна.",
  },
];

export default function SupportPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navigation />

      <main className="flex-1 py-12 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
              Бид хэрхэн туслах вэ?
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Түгээмэл асуултын хариултаа олох эсвэл дэмжлэгийн багтай
              холбогдоорой
            </p>
          </div>

          {/* Search */}
          <div className="mx-auto mt-8 max-w-xl">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Тусламж хайх..."
                className="h-12 pl-12 text-base"
              />
            </div>
          </div>

          {/* Quick Links */}
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <Card className="border-border/60 transition-colors hover:border-border">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <FileQuestion className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Түгээмэл асуултууд
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Нийтлэг асуултууд
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60 transition-colors hover:border-border">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Нийлүүлэгчийн гарын авлага
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Эхлэх мэдээлэл
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60 transition-colors hover:border-border">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Холбоо барих</p>
                  <p className="text-sm text-muted-foreground">
                    Бидэнтэй холбогдох
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-16 grid gap-12 lg:grid-cols-2">
            {/* FAQs */}
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Түгээмэл асуултууд
              </h2>
              <div className="mt-6 space-y-4">
                {faqs.map((faq, index) => (
                  <Card key={index} className="border-border/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-medium">
                        {faq.question}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {faq.answer}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Contact Info */}
            <div>
              {/* Contact Info */}
              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="text-lg">
                    Холбоо барих мэдээлэл
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">И-мэйл</p>
                      <p className="text-sm text-muted-foreground">
                        procurement@mak.mn
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Утас</p>
                      <p className="text-sm text-muted-foreground">
                        +976 7000 0000
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Хаяг</p>
                      <p className="text-sm text-muted-foreground">
                        Энхтайваны өргөн чөлөө 123, Улаанбаатар, Монгол Улс
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-foreground">Ажлын цаг</p>
                      <p className="text-sm text-muted-foreground">
                        Даваа - Баасан: 09:00 - 18:00
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
