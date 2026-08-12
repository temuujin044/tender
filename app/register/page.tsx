"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  type CompanyFormData,
  companyStatusOptions,
  countryOptions,
  emptyCompanyFormData,
  entityTypeOptions,
  validateCompanyFields,
  validateContactFields,
  validateCredentialFields,
} from "@/lib/company-form";
import { cn } from "@/lib/utils";
import { registerDummyVendor } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] =
    useState<CompanyFormData>(emptyCompanyFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = <K extends keyof CompanyFormData>(
    field: K,
    value: CompanyFormData[K],
  ) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
    setErrors((current) => {
      if (
        !current[field] &&
        field !== "password" &&
        field !== "confirmPassword"
      ) {
        return current;
      }

      const next = { ...current };
      delete next[field];

      if (field === "password" || field === "confirmPassword") {
        delete next.confirmPassword;
      }

      return next;
    });
  };

  const getFieldClass = (
    field: keyof CompanyFormData,
    options?: { hasIcon?: boolean; textarea?: boolean },
  ) =>
    cn(
      "bg-slate-50 transition-colors focus-visible:bg-white",
      options?.textarea ? "min-h-24 resize-none" : "h-11",
      options?.hasIcon && "pl-10",
      errors[field]
        ? "border-red-500 focus-visible:ring-red-500"
        : "border-slate-200 focus-visible:ring-orange-500",
    );

  const getSelectClass = (field: keyof CompanyFormData) =>
    cn(
      "h-11 bg-slate-50",
      errors[field]
        ? "border-red-500 focus:ring-red-500"
        : "border-slate-200 focus:ring-orange-500",
    );

  const renderError = (field: keyof CompanyFormData) =>
    errors[field] ? (
      <p className="text-xs font-medium text-red-500">{errors[field]}</p>
    ) : null;

  const handleNext = () => {
    if (step === 1) {
      const nextErrors = validateCompanyFields(formData);
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length === 0) {
        setStep(2);
      }
      return;
    }

    if (step === 2) {
      const nextErrors = validateContactFields(formData);
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length === 0) {
        setStep(3);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nextErrors = validateCredentialFields(formData);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const result = registerDummyVendor(formData);
    if (!result.success) {
      setErrors({ username: result.message ?? "Бүртгэл хадгалагдсангүй." });
      setIsLoading(false);
      return;
    }
    router.push("/login?registered=true");
  };

  const steps = [
    { id: 1, name: "Байгууллага" },
    { id: 2, name: "Холбоо барих" },
    { id: 3, name: "Нууц үг" },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      <div className="relative hidden w-1/2 overflow-hidden bg-slate-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-orange-500/10 blur-3xl" />

        <Brand
          href="/"
          size="lg"
          priority
          className="relative z-10"
          textClassName="font-bold text-white"
        />

        <div className="relative z-10 max-w-md">
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-white">
            Итгэмжлэгдсэн нийлүүлэгчдийн сүлжээнд нэгдээрэй
          </h1>
          <p className="mb-10 text-lg text-slate-300">
            Компаниа бүртгүүлж, профайл мэдээллээ бүрэн оруулснаар тендерийн
            урилгуудыг шууд хүлээн авах боломжтой.
          </p>

          <div className="space-y-6">
            {steps.map((item) => (
              <div key={item.id} className="flex items-start gap-4">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                    step > item.id
                      ? "bg-orange-500 text-white"
                      : step === item.id
                        ? "border border-orange-500/50 bg-orange-500/20 text-orange-400"
                        : "bg-slate-800 text-slate-500",
                  )}
                >
                  {step > item.id ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-bold">{item.id}</span>
                  )}
                </div>
                <div className="pt-2">
                  <p
                    className={cn(
                      "font-medium",
                      step >= item.id ? "text-white" : "text-slate-500",
                    )}
                  >
                    {item.name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-sm text-slate-500">
          &copy; {new Date().getFullYear()} МАК Тендер. Бүх эрх хуулиар
          хамгаалагдсан.
        </p>
      </div>

      <div className="flex w-full items-start justify-center px-4 py-8 lg:w-1/2 lg:px-12 lg:py-12">
        <div className="w-full max-w-3xl">
          <div className="mb-8 flex justify-center lg:hidden">
            <Brand
              href="/"
              size="md"
              priority
              textClassName="font-bold text-slate-900"
            />
          </div>

          <Card className="rounded-2xl border-slate-200 bg-white shadow-xl shadow-slate-200/50">
            <CardHeader className="space-y-2 px-6 pb-6 pt-8">
              <div className="mb-6 flex items-center justify-between gap-2">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="flex-1">
                    <div
                      className={cn(
                        "h-1.5 w-full rounded-full transition-colors duration-300",
                        item < step
                          ? "bg-orange-500"
                          : item === step
                            ? "bg-orange-400"
                            : "bg-slate-100",
                      )}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl font-bold text-slate-900">
                  {step === 1 && "Компанийн мэдээлэл"}
                  {step === 2 && "Холбоо барих ажилтан"}
                  {step === 3 && "Нууц үг"}
                </CardTitle>
                <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600">
                  {step} / 3
                </span>
              </div>
              <CardDescription className="space-y-1 text-slate-500">
                <span className="block">
                  {step === 1 &&
                    "Байгууллагын үндсэн мэдээлэл, статус болон холбоо барих сувгаа оруулна уу."}
                  {step === 2 &&
                    "Холбоо барих үндсэн ажилтны мэдээллийг оруулна уу."}
                  {step === 3 && "Системд нэвтрэх эрхийн мэдээллээ үүсгэнэ үү."}
                </span>
                <span className="block text-xs font-medium text-orange-600">
                  * тэмдэгтэй талбарууд заавал бөглөгдөнө.
                </span>
              </CardDescription>
            </CardHeader>

            <CardContent className="px-6 pb-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div
                  className={cn(
                    "space-y-5 transition-all duration-300",
                    step === 1 ? "block" : "hidden",
                  )}
                >
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="entityType" className="text-slate-700">
                        Төрөл<span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={formData.entityType || undefined}
                        onValueChange={(value) =>
                          updateField("entityType", value)
                        }
                      >
                        <SelectTrigger
                          id="entityType"
                          className={getSelectClass("entityType")}
                        >
                          <SelectValue placeholder="Сонгох..." />
                        </SelectTrigger>
                        <SelectContent>
                          {entityTypeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {renderError("entityType")}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="country" className="text-slate-700">
                        Улс<span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={formData.country || undefined}
                        onValueChange={(value) => updateField("country", value)}
                      >
                        <SelectTrigger
                          id="country"
                          className={getSelectClass("country")}
                        >
                          <SelectValue placeholder="Сонгох..." />
                        </SelectTrigger>
                        <SelectContent>
                          {countryOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {renderError("country")}
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="companyName" className="text-slate-700">
                        Компанийн нэр<span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <Building2
                          className={cn(
                            "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                            errors.companyName
                              ? "text-red-500"
                              : "text-slate-400",
                          )}
                        />
                        <Input
                          id="companyName"
                          placeholder="Компанийн нэр"
                          value={formData.companyName}
                          onChange={(e) =>
                            updateField("companyName", e.target.value)
                          }
                          className={getFieldClass("companyName", {
                            hasIcon: true,
                          })}
                        />
                      </div>
                      {renderError("companyName")}
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="registrationNumber"
                        className="text-slate-700"
                      >
                        Регистрийн дугаар<span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <FileText
                          className={cn(
                            "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                            errors.registrationNumber
                              ? "text-red-500"
                              : "text-slate-400",
                          )}
                        />
                        <Input
                          id="registrationNumber"
                          placeholder="Регистрийн дугаар"
                          value={formData.registrationNumber}
                          onChange={(e) =>
                            updateField("registrationNumber", e.target.value)
                          }
                          className={getFieldClass("registrationNumber", {
                            hasIcon: true,
                          })}
                        />
                      </div>
                      {renderError("registrationNumber")}
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="companyStatus" className="text-slate-700">
                        Компанийн статус
                      </Label>
                      <Select
                        value={formData.companyStatus || undefined}
                        onValueChange={(value) =>
                          updateField("companyStatus", value)
                        }
                      >
                        <SelectTrigger
                          id="companyStatus"
                          className={getSelectClass("companyStatus")}
                        >
                          <SelectValue placeholder="Сонгох..." />
                        </SelectTrigger>
                        <SelectContent>
                          {companyStatusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="isVatPayer" className="text-slate-700">
                        НӨАТ төлөгч эсэх
                      </Label>
                      <div className="flex h-11 items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium text-slate-700">
                            НӨАТ төлөгч
                          </p>
                          <p className="text-xs text-slate-500">
                            {formData.isVatPayer ? "Тийм" : "Үгүй"}
                          </p>
                        </div>
                        <Switch
                          id="isVatPayer"
                          checked={formData.isVatPayer}
                          onCheckedChange={(checked) =>
                            updateField("isVatPayer", checked)
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label
                        htmlFor="businessDirection"
                        className="text-slate-700"
                      >
                        Үйл ажиллагааны чиглэл
                        <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="businessDirection"
                        placeholder="Жишээ: Барилга, ханган нийлүүлэлт"
                        value={formData.businessDirection}
                        onChange={(e) =>
                          updateField("businessDirection", e.target.value)
                        }
                        className={getFieldClass("businessDirection")}
                      />
                      {renderError("businessDirection")}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="foundedDate" className="text-slate-700">
                        Компани байгуулагдсан огноо
                        <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="foundedDate"
                        type="date"
                        value={formData.foundedDate}
                        onChange={(e) =>
                          updateField("foundedDate", e.target.value)
                        }
                        className={getFieldClass("foundedDate")}
                      />
                      {renderError("foundedDate")}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyAddress" className="text-slate-700">
                      Компанийн хаяг<span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <MapPin
                        className={cn(
                          "absolute left-3 top-3 h-4 w-4",
                          errors.companyAddress
                            ? "text-red-500"
                            : "text-slate-400",
                        )}
                      />
                      <Textarea
                        id="companyAddress"
                        placeholder="Дэлгэрэнгүй хаяг"
                        value={formData.companyAddress}
                        onChange={(e) =>
                          updateField("companyAddress", e.target.value)
                        }
                        className={getFieldClass("companyAddress", {
                          hasIcon: true,
                          textarea: true,
                        })}
                      />
                    </div>
                    {renderError("companyAddress")}
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="companyPhone" className="text-slate-700">
                        Байгууллагын утас<span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <Phone
                          className={cn(
                            "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                            errors.companyPhone
                              ? "text-red-500"
                              : "text-slate-400",
                          )}
                        />
                        <Input
                          id="companyPhone"
                          placeholder="Байгууллагын утас"
                          value={formData.companyPhone}
                          onChange={(e) =>
                            updateField("companyPhone", e.target.value)
                          }
                          className={getFieldClass("companyPhone", {
                            hasIcon: true,
                          })}
                        />
                      </div>
                      {renderError("companyPhone")}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="companyEmail" className="text-slate-700">
                        Байгууллагын и-мэйл хаяг
                        <span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <Mail
                          className={cn(
                            "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                            errors.companyEmail
                              ? "text-red-500"
                              : "text-slate-400",
                          )}
                        />
                        <Input
                          id="companyEmail"
                          type="email"
                          placeholder="info@company.mn"
                          value={formData.companyEmail}
                          onChange={(e) =>
                            updateField("companyEmail", e.target.value)
                          }
                          className={getFieldClass("companyEmail", {
                            hasIcon: true,
                          })}
                        />
                      </div>
                      {renderError("companyEmail")}
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="parentCompany" className="text-slate-700">
                        Толгой компани
                      </Label>
                      <Input
                        id="parentCompany"
                        placeholder="Толгой компанийн нэр"
                        value={formData.parentCompany}
                        onChange={(e) =>
                          updateField("parentCompany", e.target.value)
                        }
                        className={getFieldClass("parentCompany")}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="shareholders" className="text-slate-700">
                        Хувьцаа эзэмшигч
                      </Label>
                      <Input
                        id="shareholders"
                        placeholder="Жишээ: А.Бат, Б.Сүх"
                        value={formData.shareholders}
                        onChange={(e) =>
                          updateField("shareholders", e.target.value)
                        }
                        className={getFieldClass("shareholders")}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website" className="text-slate-700">
                      Вэб сайт
                    </Label>
                    <Input
                      id="website"
                      type="url"
                      placeholder="https://example.mn"
                      value={formData.website}
                      onChange={(e) => updateField("website", e.target.value)}
                      className={getFieldClass("website")}
                    />
                  </div>
                </div>

                <div
                  className={cn(
                    "space-y-5 transition-all duration-300",
                    step === 2 ? "block" : "hidden",
                  )}
                >
                  <div className="space-y-2">
                    <Label htmlFor="contactName" className="text-slate-700">
                      Нэр<span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <User
                        className={cn(
                          "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                          errors.contactName
                            ? "text-red-500"
                            : "text-slate-400",
                        )}
                      />
                      <Input
                        id="contactName"
                        placeholder="Овог, нэр"
                        value={formData.contactName}
                        onChange={(e) =>
                          updateField("contactName", e.target.value)
                        }
                        className={getFieldClass("contactName", {
                          hasIcon: true,
                        })}
                      />
                    </div>
                    {renderError("contactName")}
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contactPhone" className="text-slate-700">
                        Утас<span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <Phone
                          className={cn(
                            "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                            errors.contactPhone
                              ? "text-red-500"
                              : "text-slate-400",
                          )}
                        />
                        <Input
                          id="contactPhone"
                          placeholder="Утасны дугаар"
                          value={formData.contactPhone}
                          onChange={(e) =>
                            updateField("contactPhone", e.target.value)
                          }
                          className={getFieldClass("contactPhone", {
                            hasIcon: true,
                          })}
                        />
                      </div>
                      {renderError("contactPhone")}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contactEmail" className="text-slate-700">
                        И-мэйл хаяг<span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <Mail
                          className={cn(
                            "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                            errors.contactEmail
                              ? "text-red-500"
                              : "text-slate-400",
                          )}
                        />
                        <Input
                          id="contactEmail"
                          type="email"
                          placeholder="contact@company.mn"
                          value={formData.contactEmail}
                          onChange={(e) =>
                            updateField("contactEmail", e.target.value)
                          }
                          className={getFieldClass("contactEmail", {
                            hasIcon: true,
                          })}
                        />
                      </div>
                      {renderError("contactEmail")}
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    "space-y-5 transition-all duration-300",
                    step === 3 ? "block" : "hidden",
                  )}
                >
                  <div className="space-y-2">
                    <Label htmlFor="username" className="text-slate-700">
                      Системд нэвтрэх нэр<span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="username"
                      placeholder="Нэвтрэх нэр"
                      value={formData.username}
                      onChange={(e) => updateField("username", e.target.value)}
                      className={getFieldClass("username")}
                    />
                    {renderError("username")}
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-slate-700">
                        Нууц үг оруулах<span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={formData.password}
                          onChange={(e) =>
                            updateField("password", e.target.value)
                          }
                          className={cn(getFieldClass("password"), "pr-10")}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((current) => !current)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      {renderError("password")}
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="confirmPassword"
                        className="text-slate-700"
                      >
                        Нууц үг давтан оруулах
                        <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="••••••••"
                        value={formData.confirmPassword}
                        onChange={(e) =>
                          updateField("confirmPassword", e.target.value)
                        }
                        className={getFieldClass("confirmPassword")}
                      />
                      {renderError("confirmPassword")}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex gap-3 border-t border-slate-100 pt-6">
                  {step > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 w-1/3 border-slate-200 font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      onClick={() => setStep((current) => current - 1)}
                    >
                      Буцах
                    </Button>
                  )}
                  {step < 3 ? (
                    <Button
                      type="button"
                      className="h-12 flex-1 bg-orange-500 font-medium text-white shadow-md shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-[0.98]"
                      onClick={handleNext}
                    >
                      Үргэлжлүүлэх
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      className="h-12 flex-1 bg-orange-500 font-medium text-white shadow-md shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-[0.98]"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Түр хүлээнэ үү...
                        </>
                      ) : (
                        <>
                          Бүртгэл үүсгэх
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </form>

              <div className="mt-8 text-center text-sm text-slate-500">
                Бүртгэлтэй юу?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-orange-600 transition-colors hover:text-orange-700 hover:underline"
                >
                  Нэвтрэх
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
