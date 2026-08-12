import { TenderList } from "@/components/tenders/tender-list";
import { tenders } from "@/lib/tender-data";

export const metadata = {
  title: "Нээлттэй тендерүүд - МАК Тендер",
  description:
    "Одоо нээлттэй байгаа худалдан авалтын тендерүүдийг үзэж, эцсийн хугацаанаас өмнө саналаа ирүүлээрэй.",
};

export default function OpenTendersPage() {
  const openTenders = tenders.filter(
    (t) => t.status === "open" || t.status === "closing-soon"
  );

  return (
    <div className="py-8 lg:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <TenderList
          tenders={openTenders}
          title="Нээлттэй тендерүүд"
          description="Одоо нээлттэй байгаа худалдан авалтын боломжуудыг үзэж, эцсийн хугацаанаас өмнө саналаа ирүүлээрэй"
          defaultStatus="all"
          includeEmployeePublished
        />
      </div>
    </div>
  );
}
