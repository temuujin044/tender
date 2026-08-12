import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { AUTH_COOKIE_KEY, AUTH_ROLE_COOKIE_KEY } from "@/lib/auth"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  if (cookieStore.get(AUTH_COOKIE_KEY)?.value !== "true") redirect("/login?redirect=/dashboard")
  if (cookieStore.get(AUTH_ROLE_COOKIE_KEY)?.value === "employee") redirect("/employee")
  return (
    <div className="flex min-h-screen">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
