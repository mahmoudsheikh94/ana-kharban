import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ReportsFilters } from "@/components/reports-filters";
import { ReportsTable } from "@/components/reports-table";
import { parseReportFilters } from "@/lib/reports/filters";
import { getReportFilterOptions, getReports } from "@/lib/supabase/reports";
import { FileSearch } from "lucide-react";

export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const filters = parseReportFilters(await searchParams);
  const [reports, options] = await Promise.all([getReports(filters), getReportFilterOptions()]);

  return (
    <AppShell title="البلاغات" subtitle="فرز ومراجعة البلاغات الواردة حسب الحالة والخطورة والتصنيف والموقع والتاريخ.">
      <div className="space-y-5">
        <ReportsFilters filters={filters} options={options} />
        {reports.length > 0 ? (
          <ReportsTable reports={reports} />
        ) : (
          <EmptyState icon={FileSearch} title="لا توجد بلاغات مطابقة" message="غيّر الفلاتر أو امسحها لعرض نتائج أخرى." />
        )}
      </div>
    </AppShell>
  );
}
