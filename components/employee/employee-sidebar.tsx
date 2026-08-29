"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BarChart3, Bell, ChevronLeft, ClipboardCheck, FilePlus2, Files, LogOut, Menu, Settings, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AUTH_STATE_EVENT, clearStoredAuthState, getStoredUser, type AuthUser } from "@/lib/auth"
import { cn } from "@/lib/utils"

const items = [
  { label: "Хяналтын самбар", href: "/employee", icon: BarChart3 },
  { label: "Тендерүүд", href: "/employee/tenders", icon: Files },
  { label: "Тендер үүсгэх", href: "/employee/tenders/new", icon: FilePlus2 },
  { label: "Үнэлгээ", href: "/employee/evaluations", icon: ClipboardCheck },
  { label: "Мэдэгдэл", href: "/employee/notifications", icon: Bell, disabled: true },
  { label: "Тохиргоо", href: "/employee/settings", icon: Settings },
]

export function EmployeeSidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    const sync = () => setUser(getStoredUser())
    sync()
    window.addEventListener(AUTH_STATE_EVENT, sync)
    return () => window.removeEventListener(AUTH_STATE_EVENT, sync)
  }, [])

  const active = (href: string) => href === "/employee" ? pathname === href : pathname.startsWith(href)

  return <>
    <Button variant="outline" size="icon" className="fixed left-4 top-4 z-50 border-slate-200 bg-white lg:hidden" onClick={() => setMobileOpen((value) => !value)}><Menu className="h-5 w-5" /></Button>
    {mobileOpen && <button type="button" aria-label="Цэс хаах" className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />}
    <aside className={cn("fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white text-slate-900 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all lg:relative lg:translate-x-0", collapsed ? "w-20" : "w-72", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
      <Button variant="outline" size="icon" className="absolute -right-4 top-6 hidden h-8 w-8 rounded-full border-slate-200 bg-white text-slate-700 lg:flex" onClick={() => setCollapsed((value) => !value)}><ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} /></Button>
      <div className="flex h-20 items-center border-b border-slate-100 px-5">
        <Link href="/employee" className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 shadow-md shadow-orange-500/20"><Image src="/mak_logo.png" alt="МАК" width={36} height={36} className="h-9 w-9 object-contain" /></span>{!collapsed && <span><span className="block text-lg font-bold text-slate-900">МАК <span className="text-orange-500">Тендер</span></span><span className="block text-[10px] uppercase tracking-[.18em] text-slate-500">Ажилтны систем</span></span>}</Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {!collapsed && <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">Удирдлага</p>}
        {items.map((item) => {
          const Icon = item.icon
          if (item.disabled) return <div key={item.href} title={collapsed ? item.label : undefined} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400", collapsed && "justify-center")}><Icon className="h-5 w-5 shrink-0" />{!collapsed && <><span className="flex-1">{item.label}</span><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-400">Тун удахгүй</span></>}</div>
          return <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} onClick={() => setMobileOpen(false)} className={cn("flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors", active(item.href) ? "bg-orange-50 text-orange-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900", collapsed && "justify-center")}><Icon className="h-5 w-5 shrink-0" />{!collapsed && <span>{item.label}</span>}</Link>
        })}
      </nav>
      <div className="border-t border-slate-100 p-4">
        <div className={cn("flex items-center gap-3 rounded-xl bg-slate-50 p-3", collapsed && "justify-center")}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 ring-2 ring-white"><UserRound className="h-5 w-5" /></span>{!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-700">{user?.contactName || user?.username || "Нэвтрээгүй"}</p><p className="truncate text-xs text-slate-500">{user?.email || (user?.employeeId ? `Ажилтны ID: ${user.employeeId}` : "Ажилтны мэдээлэл алга")}</p></div>}</div>
        <Link href="/login" onClick={() => clearStoredAuthState()} className="mt-2 block"><Button variant="ghost" className={cn("w-full text-slate-500 hover:bg-red-50 hover:text-red-600", collapsed ? "justify-center px-0" : "justify-start")}><LogOut className="h-4 w-4" />{!collapsed && <span className="ml-3">Гарах</span>}</Button></Link>
      </div>
    </aside>
  </>
}
