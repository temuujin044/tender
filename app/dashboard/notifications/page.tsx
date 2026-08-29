"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, Bell, CheckCircle, Clock, FileText, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { fetchVendorNotifications, type VendorNotification } from "@/lib/api"
import { getStoredUser } from "@/lib/auth"

const typeConfig = {
  deadline: { label: "Хугацаа ойртсон", icon: AlertCircle, iconColor: "text-amber-600", bgColor: "bg-amber-100" },
  status: { label: "Оролцсон тендер", icon: Clock, iconColor: "text-blue-600", bgColor: "bg-blue-100" },
  new: { label: "Тендерийн мэдээлэл", icon: FileText, iconColor: "text-orange-600", bgColor: "bg-orange-50" },
  result: { label: "Тендерийн үр дүн", icon: CheckCircle, iconColor: "text-emerald-600", bgColor: "bg-emerald-100" },
} satisfies Record<VendorNotification["type"], { label: string; icon: typeof Bell; iconColor: string; bgColor: string }>

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<VendorNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const user = getStoredUser()
    if (!user?.vendorId) {
      setError("Нэвтэрсэн нийлүүлэгчийн бодит ID олдсонгүй. Дахин нэвтэрнэ үү.")
      setLoading(false)
      return
    }
    void fetchVendorNotifications(user.vendorId)
      .then(setNotifications)
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Мэдэгдлийн мэдээлэл ачаалж чадсангүй."))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Мэдэгдэл</h1>
          <p className="mt-1 text-muted-foreground">Backend мэдээллийн сан дахь тендерийн төлөв, хугацаа болон оролцооны мэдээлэл.</p>
        </header>

        <div className="mb-6">
          <Badge variant="secondary" className="bg-secondary text-secondary-foreground">{notifications.length} нийт</Badge>
        </div>

        <Card className="border-border/60">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-orange-500" />Мэдээллийг backend-ээс ачаалж байна...
              </div>
            ) : error ? (
              <div className="py-16 text-center">
                <AlertCircle className="mx-auto size-10 text-red-500" />
                <p className="mt-4 text-sm font-medium text-red-700">{error}</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-16 text-center">
                <Bell className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">Мэдэгдэл үүсгэх тендерийн үйл явдал алга.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {notifications.map((notification) => {
                  const config = typeConfig[notification.type]
                  const Icon = config.icon
                  return (
                    <Link
                      key={notification.id}
                      href={`/tenders/${notification.invitationId}`}
                      className="flex gap-4 p-6 transition-colors hover:bg-slate-50"
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${config.bgColor}`}>
                        <Icon className={`h-5 w-5 ${config.iconColor}`} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{config.label}</span>
                          <Badge variant="outline" className="font-normal">{notification.statusName}</Badge>
                        </span>
                        <span className="mt-1 block truncate text-sm text-muted-foreground">{notification.title}</span>
                        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="font-medium text-orange-600">{notification.tenderCode}</span>
                          <span>{notification.invitationCode}</span>
                          <span>{notification.time}</span>
                        </span>
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
