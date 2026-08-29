"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronLeft,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { AUTH_STATE_EVENT, clearStoredAuthState, getStoredUser, type AuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const primaryItems = [
  {
    label: "Хяналтын самбар",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Миний тендерүүд",
    href: "/dashboard/my-tenders",
    icon: FolderOpen,
  },
];

const tenderItems = [
  {
    label: "Нээлттэй тендерүүд",
    href: "/tenders/open",
  },
  {
    label: "Оролцсон тендер / Үр дүн",
    href: "/tenders/closed",
  },
];

const secondaryItems = [
  {
    label: "Мэдэгдэл",
    href: "/dashboard/notifications",
    icon: Bell,
  },
  {
    label: "Профайл",
    href: "/dashboard/profile",
    icon: User,
  },
];

function isTenderRoute(pathname: string) {
  return pathname.startsWith("/tenders");
}

function getActiveTenderHref(pathname: string) {
  if (pathname === "/tenders/closed") {
    return "/tenders/closed";
  }

  if (
    pathname === "/tenders/open" ||
    /^\/tenders\/[^/]+(\/submit)?$/.test(pathname)
  ) {
    return "/tenders/open";
  }

  return "";
}

function getIsActive(pathname: string, href: string) {
  if (pathname === href) {
    return true;
  }

  if (href === "/dashboard" && pathname.startsWith("/dashboard/")) {
    return false;
  }

  return false;
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [openSection, setOpenSection] = useState(
    isTenderRoute(pathname) ? "tenders" : "",
  );

  const activeTenderHref = getActiveTenderHref(pathname);
  const isTenderSectionActive = isTenderRoute(pathname);

  useEffect(() => {
    if (collapsed) {
      setOpenSection("");
      return;
    }

    if (isTenderRoute(pathname)) {
      setOpenSection("tenders");
    }
  }, [collapsed, pathname]);

  useEffect(() => {
    const syncUser = () => setUser(getStoredUser());
    syncUser();
    window.addEventListener(AUTH_STATE_EVENT, syncUser);
    return () => window.removeEventListener(AUTH_STATE_EVENT, syncUser);
  }, []);

  const handleLogout = () => {
    clearStoredAuthState();
    setMobileOpen(false);
  };

  const expandTenderSection = () => {
    setCollapsed(false);
    setOpenSection("tenders");
  };

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="fixed left-4 top-4 z-50 rounded-xl border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-orange-50 hover:text-orange-600 lg:hidden"
        onClick={() => setMobileOpen((prev) => !prev)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-300 ease-in-out lg:relative lg:z-0",
          collapsed ? "w-20" : "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <Button
          variant="outline"
          size="icon"
          className="absolute -right-4 top-6 z-50 hidden h-8 w-8 rounded-full border-slate-200 bg-white shadow-sm hover:bg-slate-50 hover:text-orange-600 lg:flex"
          onClick={() => setCollapsed((prev) => !prev)}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform duration-300",
              collapsed && "rotate-180",
            )}
          />
        </Button>

        <div className="flex h-20 items-center justify-center border-b border-slate-100 px-4">
          <Link href="/dashboard" className="flex items-center gap-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-md shadow-orange-500/20">
              <Image
                src="/mak_logo.png"
                alt="МАК лого"
                width={34}
                height={34}
                priority
                className="h-8 w-8 object-contain"
              />
            </div>
            {!collapsed && (
              <span className="whitespace-nowrap text-xl font-bold tracking-tight text-slate-900 transition-opacity">
                МАК<span className="text-orange-500">Тендер</span>
              </span>
            )}
          </Link>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto overflow-x-hidden px-3 py-6">
          <nav className="space-y-1.5">
            {primaryItems.map((item) => {
              const isActive = getIsActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-orange-50 text-orange-600"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                    collapsed && "justify-center px-2",
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  {isActive && !collapsed && (
                    <div className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-orange-500" />
                  )}

                  <item.icon
                    className={cn(
                      "h-5 w-5 shrink-0 transition-colors",
                      isActive
                        ? "text-orange-500"
                        : "text-slate-400 group-hover:text-slate-600",
                    )}
                  />

                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}

            {collapsed ? (
              <button
                type="button"
                title="Тендер"
                className={cn(
                  "group relative flex w-full justify-center rounded-xl px-2 py-3 text-sm font-medium transition-all duration-200",
                  isTenderSectionActive
                    ? "bg-orange-50 text-orange-600"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                )}
                onClick={expandTenderSection}
              >
                <FileText
                  className={cn(
                    "h-5 w-5 shrink-0 transition-colors",
                    isTenderSectionActive
                      ? "text-orange-500"
                      : "text-slate-400 group-hover:text-slate-600",
                  )}
                />
              </button>
            ) : (
              <Accordion
                type="single"
                collapsible
                value={openSection}
                onValueChange={setOpenSection}
                className="rounded-xl"
              >
                <AccordionItem value="tenders" className="border-none">
                  <AccordionTrigger
                    className={cn(
                      "rounded-xl px-3 py-3 text-sm font-medium hover:no-underline",
                      isTenderSectionActive
                        ? "bg-orange-50 text-orange-600"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <FileText
                        className={cn(
                          "h-5 w-5 shrink-0 transition-colors",
                          isTenderSectionActive
                            ? "text-orange-500"
                            : "text-slate-400",
                        )}
                      />
                      <span>Тендер</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <div className="mt-1 space-y-1 pl-5">
                      {tenderItems.map((item) => {
                        const isActive = activeTenderHref === item.href;

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                              isActive
                                ? "bg-orange-50/80 font-medium text-orange-600"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                            )}
                            onClick={() => setMobileOpen(false)}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                isActive ? "bg-orange-500" : "bg-slate-300",
                              )}
                            />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {secondaryItems.map((item) => {
              const isActive = getIsActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-orange-50 text-orange-600"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                    collapsed && "justify-center px-2",
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  {isActive && !collapsed && (
                    <div className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-orange-500" />
                  )}

                  <item.icon
                    className={cn(
                      "h-5 w-5 shrink-0 transition-colors",
                      isActive
                        ? "text-orange-500"
                        : "text-slate-400 group-hover:text-slate-600",
                    )}
                  />

                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-slate-100 p-4">
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl bg-slate-50 p-3 transition-all",
              collapsed ? "justify-center" : "justify-start",
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 ring-2 ring-white">
              <User className="h-5 w-5" />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate text-sm font-semibold text-slate-700">
                  {user?.contactName ?? "Тест хэрэглэгч"}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {user?.email ?? "test@company.mn"}
                </p>
              </div>
            )}
          </div>

          <Link href="/login" className="mt-3 block" onClick={handleLogout}>
            <Button
              variant="ghost"
              className={cn(
                "w-full text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600",
                collapsed ? "justify-center px-0" : "justify-start px-4",
              )}
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span className="ml-3 font-medium">Гарах</span>}
            </Button>
          </Link>
        </div>
      </aside>
    </>
  );
}
