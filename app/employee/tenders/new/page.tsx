"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { createEmployeeTender } from "@/lib/dummy-employee-store"
import { getStoredUser } from "@/lib/auth"

export default function NewEmployeeTenderPage() {
  const router = useRouter()
  useEffect(() => {
    const tender = createEmployeeTender(getStoredUser()?.contactName ?? "Тендерийн ажилтан")
    router.replace(`/employee/tenders/${tender.id}`)
  }, [router])
  return <div className="flex min-h-[70vh] items-center justify-center"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-orange-500" /><p className="mt-3 text-sm text-slate-500">Шинэ тендерийн төсөл үүсгэж байна...</p></div></div>
}
