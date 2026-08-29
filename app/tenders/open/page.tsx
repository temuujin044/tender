import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RealOpenTenderList } from "@/components/tenders/real-open-tender-list";
import { AUTH_COOKIE_KEY } from "@/lib/auth";

export const metadata = {
  title: "Нээлттэй тендерүүд - МАК Тендер",
  description:
    "Одоо нээлттэй байгаа худалдан авалтын тендерүүдийг үзэж, эцсийн хугацаанаас өмнө саналаа ирүүлээрэй.",
};

export default async function OpenTendersPage() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.get(AUTH_COOKIE_KEY)?.value === "true";

  if (!isAuthenticated) {
    redirect("/#open-tenders");
  }

  return (
    <div className="py-8 lg:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <RealOpenTenderList />
      </div>
    </div>
  );
}
