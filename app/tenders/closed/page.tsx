import { TenderAccessGuard } from "@/components/auth/tender-access-guard";
import { ParticipationResults } from "@/components/tenders/participation-results";

export const metadata = {
  title: "Оролцсон тендер ба үр дүн - МАК Тендер",
  description: "Оролцсон тендерүүд болон саналын үнэлгээний үр дүнг хянах.",
};

export default function ClosedTendersPage() {
  return (
    <div className="bg-slate-50/70 py-8 lg:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <TenderAccessGuard redirectPath="/tenders/closed">
          <ParticipationResults />
        </TenderAccessGuard>
      </div>
    </div>
  );
}
