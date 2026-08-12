"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Bell,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  Check,
  Trash2,
} from "lucide-react"

const initialNotifications = [
  {
    id: 1,
    type: "deadline",
    title: "Хугацаа ойртож байна",
    message: "'Байгууллагын арга хэмжээний хоол үйлчилгээ' тендерийн хугацаа 2 хоногийн дараа дуусна.",
    tender: "TND-2024-005",
    time: "2 цагийн өмнө",
    read: false,
  },
  {
    id: 2,
    type: "status",
    title: "Саналын төлөв шинэчлэгдлээ",
    message: "'Оффисын барилгын их засварын төсөл' тендерт илгээсэн таны санал хянагдаж байна.",
    tender: "TND-2024-002",
    time: "1 өдрийн өмнө",
    read: false,
  },
  {
    id: 3,
    type: "new",
    title: "Шинэ тендер нийтлэгдлээ",
    message: "Таны сонирхолд нийцэх шинэ тендер нийтлэгдлээ: 'Аж ахуйн программ хангамжийн лиценз шинэчлэл'",
    tender: "TND-2024-006",
    time: "2 өдрийн өмнө",
    read: false,
  },
  {
    id: 4,
    type: "result",
    title: "Тендерийн үр дүн",
    message: "Баяр хүргэе. Та 'Жилийн аудитын үйлчилгээ' тендерт шалгарлаа.",
    tender: "TND-2024-008",
    time: "5 өдрийн өмнө",
    read: true,
  },
  {
    id: 5,
    type: "info",
    title: "Баримт шинэчлэгдлээ",
    message: "'Төв оффисын МТ тоног төхөөрөмж нийлүүлэх' тендерийн техникийн тодорхойлолт шинэчлэгдсэн байна. Өөрчлөлтийг шалгана уу.",
    tender: "TND-2024-001",
    time: "1 долоо хоногийн өмнө",
    read: true,
  },
]

const typeConfig = {
  deadline: {
    icon: AlertCircle,
    iconColor: "text-amber-600",
    bgColor: "bg-amber-100",
  },
  status: {
    icon: Clock,
    iconColor: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  new: {
    icon: FileText,
    iconColor: "text-primary",
    bgColor: "bg-primary/10",
  },
  result: {
    icon: CheckCircle,
    iconColor: "text-emerald-600",
    bgColor: "bg-emerald-100",
  },
  info: {
    icon: Bell,
    iconColor: "text-gray-600",
    bgColor: "bg-gray-100",
  },
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(initialNotifications)

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAsRead = (id: number) => {
    setNotifications(
      notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }

  const markAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })))
  }

  const deleteNotification = (id: number) => {
    setNotifications(notifications.filter((n) => n.id !== id))
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Мэдэгдэл</h1>
          <p className="mt-1 text-muted-foreground">
            Тендерийн үйл ажиллагааны шинэчлэлээ эндээс хянаарай
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllAsRead}>
            <Check className="mr-2 h-4 w-4" />
            Бүгдийг уншсанд тэмдэглэх
          </Button>
        )}
      </div>

      {/* Notification Stats */}
      <div className="mb-6 flex items-center gap-4">
        <Badge variant="secondary" className="bg-primary/10 text-primary">
          {unreadCount} уншаагүй
        </Badge>
        <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
          {notifications.length} нийт
        </Badge>
      </div>

      {/* Notifications List */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          {notifications.length === 0 ? (
            <div className="py-16 text-center">
              <Bell className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">Мэдэгдэл алга</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {notifications.map((notification) => {
                const config = typeConfig[notification.type as keyof typeof typeConfig]
                const Icon = config.icon
                return (
                  <div
                    key={notification.id}
                    className={`flex gap-4 p-6 transition-colors ${
                      !notification.read ? "bg-primary/[0.02]" : ""
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${config.bgColor}`}
                    >
                      <Icon className={`h-5 w-5 ${config.iconColor}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">
                              {notification.title}
                            </p>
                            {!notification.read && (
                              <span className="h-2 w-2 rounded-full bg-primary" />
                            )}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {notification.message}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <Link
                              href={`/tenders/${notification.tender}`}
                              className="text-primary hover:underline"
                            >
                              {notification.tender}
                            </Link>
                            <span>•</span>
                            <span>{notification.time}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {!notification.read && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => markAsRead(notification.id)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteNotification(notification.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
