import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { EmployeeSidebar } from "@/components/employee/employee-sidebar"
import { AUTH_COOKIE_KEY, AUTH_ROLE_COOKIE_KEY } from "@/lib/auth"

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  if (cookieStore.get(AUTH_COOKIE_KEY)?.value !== "true") redirect("/login?redirect=/employee")
  if (cookieStore.get(AUTH_ROLE_COOKIE_KEY)?.value !== "employee") redirect("/dashboard")
  return <div className="flex min-h-screen bg-slate-50"><EmployeeSidebar /><main className="min-w-0 flex-1 overflow-auto">{children}</main></div>
}
