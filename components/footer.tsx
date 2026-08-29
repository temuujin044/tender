"use client";

import Link from "next/link";
import { Mail, Phone, MapPin, ChevronRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { useAuthState } from "@/hooks/use-auth-state";

export function Footer() {
  const { isAuthenticated, isReady } = useAuthState();
  const isLoggedIn = isReady && isAuthenticated;
  const quickLinks = [
    { name: "Нээлттэй тендерүүд", href: isLoggedIn ? "/tenders/open" : "/#open-tenders" },
    ...(isLoggedIn
      ? [{ name: "Оролцсон тендер / Үр дүн", href: "/tenders/closed" }]
      : []),
    ...(!isLoggedIn ? [{ name: "Хэрхэн ажилладаг", href: "/#how-it-works" }] : []),
    { name: "Нийлүүлэгчээр бүртгүүлэх", href: "/register" },
  ];

  return (
    <footer className="border-t border-border/40 bg-background pt-16 pb-8 transition-colors duration-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {/* Brand & Description */}
          <div className="space-y-5 md:col-span-2 lg:col-span-1">
            <Brand href="/" size="sm" />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Ил тод, үр ашигтай, найдвартай тендер шалгаруулалтын системд
              зориулагдсан платформ.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-foreground">
              Шуурхай холбоосууд
            </h3>
            <ul className="space-y-3.5">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="group flex items-center text-sm text-muted-foreground transition-all duration-200 hover:translate-x-1 hover:text-primary"
                  >
                    <ChevronRight className="mr-1 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Information */}
          <div>
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-foreground">
              Мэдээлэл
            </h3>
            <ul className="space-y-3.5">
              {[
                { name: "Түгээмэл асуултууд", href: "/faq" },
                { name: "Үйлчилгээний нөхцөл", href: "/terms" },
                { name: "Нууцлалын бодлого", href: "/privacy" },
              ].map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="group flex items-center text-sm text-muted-foreground transition-all duration-200 hover:translate-x-1 hover:text-primary"
                  >
                    <ChevronRight className="mr-1 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact (Actionable) */}
          <div>
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-foreground">
              Холбоо барих
            </h3>
            <ul className="space-y-4">
              <li>
                <a
                  href="mailto:procurement@mak.mn"
                  className="group flex items-start gap-3 transition-colors hover:text-primary"
                >
                  <div className="rounded-md bg-secondary/50 p-2 transition-colors group-hover:bg-primary/10">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium uppercase text-muted-foreground/70">
                      Имэйл
                    </span>
                    <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-primary">
                      procurement@mak.mn
                    </span>
                  </div>
                </a>
              </li>
              <li>
                <a
                  href="tel:+97670000000"
                  className="group flex items-start gap-3 transition-colors hover:text-primary"
                >
                  <div className="rounded-md bg-secondary/50 p-2 transition-colors group-hover:bg-primary/10">
                    <Phone className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium uppercase text-muted-foreground/70">
                      Утас
                    </span>
                    <span className="text-sm font-medium text-muted-foreground transition-colors group-hover:text-primary">
                      +976 7000 0000
                    </span>
                  </div>
                </a>
              </li>
              <li className="flex items-start gap-3">
                <div className="rounded-md bg-secondary/50 p-2">
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
                <div className="flex flex-col pt-1">
                  <span className="text-sm font-medium text-muted-foreground">
                    Улаанбаатар хот, Монгол улс
                  </span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-border/40 pt-8 md:flex-row">
          <p className="text-center text-sm text-muted-foreground md:text-left">
            &copy; {new Date().getFullYear()} МАК Тендер. Бүх эрх хуулиар
            хамгаалагдсан.
          </p>
          <div className="flex gap-4">
            <Link
              href="/terms"
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              Үйлчилгээний нөхцөл
            </Link>
            <span className="text-muted-foreground/40">•</span>
            <Link
              href="/privacy"
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              Нууцлалын бодлого
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
