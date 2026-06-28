import { EmptyState } from "@/components/empty-state";
import { PublicShell } from "@/components/public-shell";
import { ReportsMapLoader } from "@/components/reports-map-loader";
import { getTelegramBotUsername } from "@/lib/supabase/config";
import { getPublicApprovedReports } from "@/lib/supabase/public";
import { MapPinned } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PublicMapPage() {
  const reports = await getPublicApprovedReports();
  const botUsername = getTelegramBotUsername();

  return (
    <PublicShell title="خريطة البلاغات المعتمدة" subtitle="البلاغات المعتمدة فقط، ملوّنة حسب درجة الخطورة.">
      {reports.length > 0 ? (
        <ReportsMapLoader reports={reports} volunteerBotUsername={botUsername ?? undefined} />
      ) : (
        <EmptyState icon={MapPinned} title="لا توجد بلاغات معتمدة بعد" message="ستظهر البلاغات هنا بعد اعتمادها." />
      )}
    </PublicShell>
  );
}
