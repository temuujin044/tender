"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Menu, X } from "lucide-react";

import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useAuthState } from "@/hooks/use-auth-state";
import { clearStoredAuthState } from "@/lib/auth";

export function Navigation() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated, isReady } = useAuthState();
  const homeHref = isReady && isAuthenticated ? "/dashboard" : "/";

  const tenderLinks = [
    { href: "/tenders/open", label: "Нээлттэй тендерүүд" },
    ...(isReady && isAuthenticated
      ? [
          { href: "/tenders/closed", label: "Оролцсон тендер / Үр дүн" },
        ]
      : []),
  ];

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "unset";

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileMenuOpen]);

  const handleLogout = () => {
    clearStoredAuthState();
    setMobileMenuOpen(false);
    router.push("/");
  };

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-200 ${
        scrolled
          ? "border-b border-border/40 bg-background/80 shadow-sm backdrop-blur-md"
          : "border-b border-transparent bg-background/0"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex-shrink-0">
          <Brand href={homeHref} size="sm" />
        </div>

        <nav className="hidden md:flex md:items-center md:gap-2 lg:gap-4">
          <Link
            href={homeHref}
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary/60 hover:text-foreground"
          >
            Нүүр
          </Link>

          {tenderLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary/60 hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}

          <Link
            href="/how-it-works"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary/60 hover:text-foreground"
          >
            Хэрхэн ажилладаг
          </Link>

          <Link
            href="/support"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary/60 hover:text-foreground"
          >
            Тусламж
          </Link>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-full text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
          >
            <span className="sr-only">Мэдэгдэл харах</span>
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
              3
            </span>
          </Button>
          <div className="mx-1 h-5 w-px bg-border/60" />

          {isReady && isAuthenticated ? (
            <>
              <Link href="/dashboard" tabIndex={-1}>
                <Button
                  variant="ghost"
                  className="font-medium text-muted-foreground hover:text-foreground"
                >
                  Хяналтын самбар
                </Button>
              </Link>
              <Button
                variant="ghost"
                className="font-medium text-muted-foreground hover:text-foreground"
                onClick={handleLogout}
              >
                Гарах
              </Button>
            </>
          ) : (
            <>
              <Link href="/login" tabIndex={-1}>
                <Button
                  variant="ghost"
                  className="font-medium text-muted-foreground hover:text-foreground"
                >
                  Нэвтрэх
                </Button>
              </Link>
              <Link href="/register" tabIndex={-1}>
                <Button className="font-medium shadow-sm transition-all hover:scale-105 active:scale-95">
                  Бүртгүүлэх
                </Button>
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-4 md:hidden">
          <Button variant="ghost" size="icon" className="relative rounded-full">
            <span className="sr-only">Мэдэгдэл</span>
            <Bell className="h-5 w-5 text-foreground/80" />
            <span className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
              3
            </span>
          </Button>

          <button
            className="group rounded-md p-2 text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-label="Үндсэн цэс нээх"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6 transition-transform duration-200" />
            ) : (
              <Menu className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />
            )}
          </button>
        </div>
      </div>

      <div
        className={`fixed inset-x-0 bottom-0 top-16 z-40 bg-background/95 backdrop-blur-lg transition-all duration-300 ease-in-out md:hidden ${
          mobileMenuOpen
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-4 opacity-0"
        }`}
      >
        <div className="h-full overflow-y-auto px-4 py-6 shadow-inner">
          <nav className="flex flex-col gap-2">
            <Link
              href={homeHref}
              className="flex items-center rounded-lg px-4 py-3.5 text-base font-medium text-foreground transition-colors hover:bg-secondary active:bg-secondary/80"
              onClick={() => setMobileMenuOpen(false)}
            >
              Нүүр
            </Link>

            {tenderLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center rounded-lg px-4 py-3.5 text-base font-medium text-foreground transition-colors hover:bg-secondary active:bg-secondary/80"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}

            <Link
              href="/how-it-works"
              className="flex items-center rounded-lg px-4 py-3.5 text-base font-medium text-foreground transition-colors hover:bg-secondary active:bg-secondary/80"
              onClick={() => setMobileMenuOpen(false)}
            >
              Хэрхэн ажилладаг
            </Link>

            <Link
              href="/support"
              className="flex items-center rounded-lg px-4 py-3.5 text-base font-medium text-foreground transition-colors hover:bg-secondary active:bg-secondary/80"
              onClick={() => setMobileMenuOpen(false)}
            >
              Тусламж
            </Link>

            <div className="mt-8 flex flex-col gap-3 border-t border-border/40 pb-10 pt-8">
              {isReady && isAuthenticated ? (
                <>
                  <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                    <Button
                      variant="outline"
                      className="w-full justify-center py-6 text-base shadow-sm"
                    >
                      Хяналтын самбар
                    </Button>
                  </Link>
                  <Button
                    className="w-full justify-center bg-primary py-6 text-base text-primary-foreground shadow-md transition-transform active:scale-95"
                    onClick={handleLogout}
                  >
                    Гарах
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button
                      variant="outline"
                      className="w-full justify-center py-6 text-base shadow-sm"
                    >
                      Нэвтрэх
                    </Button>
                  </Link>
                  <Link href="/register" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full justify-center bg-primary py-6 text-base text-primary-foreground shadow-md transition-transform active:scale-95">
                      Бүртгүүлэх
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
