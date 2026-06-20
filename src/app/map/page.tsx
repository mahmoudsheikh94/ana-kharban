import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ReportsMapLoader } from "@/components/reports-map-loader";
import { getApprovedMapReports } from "@/lib/supabase/reports";
import { MapPinned } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const reports = await getApprovedMapReports();

  return (
    <AppShell title="الخريطة" subtitle="عرض البلاغات المعتمدة فقط حسب موقع GPS ولون الخطورة.">
      {reports.length > 0 ? (
        <ReportsMapLoader reports={reports} />
      ) : (
        <EmptyState icon={MapPinned} title="لا توجد بلاغات معتمدة على الخريطة" message="ستظهر البلاغات هنا بعد اعتمادها." />
      )}
    </AppShell>
  );
}
