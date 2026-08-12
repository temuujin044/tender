"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Search,
  Filter,
  Calendar,
  Building2,
  ArrowUpDown,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { type Tender, categories, statusConfig } from "@/lib/tender-data"
import { EMPLOYEE_STORE_EVENT, getPublishedEmployeeTendersForVendor } from "@/lib/dummy-employee-store"

interface TenderListProps {
  tenders: Tender[]
  title: string
  description: string
  defaultStatus?: string
  includeEmployeePublished?: boolean
}

export function TenderList({ tenders, title, description, defaultStatus = "all", includeEmployeePublished = false }: TenderListProps) {
  const [visibleTenders, setVisibleTenders] = useState(tenders)
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("Бүх ангилал")
  const [statusFilter, setStatusFilter] = useState(defaultStatus)
  const [sortBy, setSortBy] = useState("deadline")
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 6

  useEffect(() => {
    if (!includeEmployeePublished) {
      setVisibleTenders(tenders)
      return
    }
    const sync = () => {
      const published = getPublishedEmployeeTendersForVendor()
      setVisibleTenders([...tenders, ...published.filter((item) => !tenders.some((tender) => tender.id === item.id))])
    }
    sync()
    window.addEventListener(EMPLOYEE_STORE_EVENT, sync)
    return () => window.removeEventListener(EMPLOYEE_STORE_EVENT, sync)
  }, [includeEmployeePublished, tenders])

  const filteredTenders = visibleTenders
    .filter((tender) => {
      const matchesSearch =
        tender.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tender.id.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory =
        categoryFilter === "Бүх ангилал" || tender.category === categoryFilter
      const matchesStatus = statusFilter === "all" || tender.status === statusFilter
      return matchesSearch && matchesCategory && matchesStatus
    })
    .sort((a, b) => {
      if (sortBy === "deadline") {
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
      } else if (sortBy === "value") {
        return parseInt(b.value.replace(/[^\d]/g, "")) - parseInt(a.value.replace(/[^\d]/g, ""))
      } else if (sortBy === "published") {
        return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
      }
      return 0
    })

  const totalPages = Math.ceil(filteredTenders.length / itemsPerPage)
  const paginatedTenders = filteredTenders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{title}</h1>
        <p className="mt-2 text-muted-foreground">{description}</p>
      </div>

      {/* Filters */}
      <Card className="border-border/60">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Тендерийн нэр эсвэл кодоор хайх..."
                  className="h-10 pl-10"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                />
              </div>
              <Select
                value={categoryFilter}
                onValueChange={(value) => {
                  setCategoryFilter(value)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="h-10 w-full sm:w-48">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Ангилал" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value)
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="h-10 w-full sm:w-40">
                  <SelectValue placeholder="Төлөв" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Бүх төлөв</SelectItem>
                  <SelectItem value="open">Нээлттэй</SelectItem>
                  <SelectItem value="closing-soon">Удахгүй хаагдана</SelectItem>
                  <SelectItem value="closed">Хаагдсан</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between border-t border-border/60 pt-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Эрэмбэлэх:</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-9 w-32">
                    <ArrowUpDown className="mr-2 h-3 w-3" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deadline">Хугацаа</SelectItem>
                    <SelectItem value="published">Зарлагдсан</SelectItem>
                    <SelectItem value="value">Үнийн дүн</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1">
                <span className="mr-2 text-sm text-muted-foreground">
                  {filteredTenders.length} үр дүн
                </span>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {paginatedTenders.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Хайлтад тохирох тендер олдсонгүй</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setSearchQuery("")
                setCategoryFilter("Бүх ангилал")
                setStatusFilter("all")
              }}
            >
              Шүүлтүүрийг цэвэрлэх
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <div className="space-y-4">
          {paginatedTenders.map((tender) => (
            <Card
              key={tender.id}
              className="group border-border/60 transition-all duration-200 hover:border-border hover:shadow-md"
            >
              <CardContent className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={statusConfig[tender.status].className}
                      >
                        {statusConfig[tender.status].label}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{tender.id}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold text-foreground">
                      {tender.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {tender.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-4 w-4" />
                        {tender.category}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        Хугацаа: {tender.deadline}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-start gap-3 lg:items-end">
                    <span className="text-lg font-semibold text-foreground">{tender.value}</span>
                    <Link href={`/tenders/${tender.id}`}>
                      <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                        Дэлгэрэнгүй
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paginatedTenders.map((tender) => (
            <Card
              key={tender.id}
              className="group flex flex-col border-border/60 transition-all duration-200 hover:border-border hover:shadow-md"
            >
              <CardContent className="flex flex-1 flex-col p-6">
                <div className="flex items-center justify-between">
                  <Badge
                    variant="secondary"
                    className={statusConfig[tender.status].className}
                  >
                    {statusConfig[tender.status].label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{tender.id}</span>
                </div>
                <h3 className="mt-3 line-clamp-2 text-base font-semibold text-foreground">
                  {tender.title}
                </h3>
                <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">
                  {tender.description}
                </p>
                <div className="mt-4 space-y-2 border-t border-border/60 pt-4 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      {tender.category}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {tender.deadline}
                    </span>
                    <span className="font-semibold text-foreground">{tender.value}</span>
                  </div>
                </div>
                <Link href={`/tenders/${tender.id}`} className="mt-4">
                  <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                    Дэлгэрэнгүй
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/60 pt-6">
          <p className="text-sm text-muted-foreground">
            {(currentPage - 1) * itemsPerPage + 1}-с{" "}
            {Math.min(currentPage * itemsPerPage, filteredTenders.length)} хүртэл{" "}
            {filteredTenders.length} үр дүнгээс
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Өмнөх
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "ghost"}
                  size="sm"
                  className={`h-8 w-8 p-0 ${
                    currentPage === page
                      ? "bg-primary text-primary-foreground"
                      : ""
                  }`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Дараах
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
