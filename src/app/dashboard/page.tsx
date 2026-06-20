import { AppShell } from "@/components/app-shell";
import { RecentReports } from "@/components/recent-reports";
import { ReportBreakdown } from "@/components/report-breakdown";
import { StatCard } from "@/components/stat-card";
import { getDashboardData } from "@/lib/supabase/reports";
import { AlertTriangle, Bot, CheckCircle2, Clock3, FileText, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { metrics, recentReports, reports } = await getDashboardData();

  return (
    <AppShell
      title="الرئيسية"
      subtitle="نظرة تشغيلية على بلاغات المواطنين الواردة من تيليجرام والمراجعة بالذكاء الاصطناعي."
    >
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="إجمالي البلاغات" value={metrics.totalReports} icon={FileText} />
        <StatCard label="البلاغات المعتمدة" value={metrics.approvedReports} icon={CheckCircle2} tone="green" />
        <StatCard label="البلاغات المرفوضة" value={metrics.rejectedReports} icon={XCircle} tone="red" />
        <StatCard label="بانتظار مراجعة AI" value={metrics.pendingAiReview} icon={Bot} tone="yellow" />
        <StatCard label="بلاغات عالية الخطورة" value={metrics.highSeverityReports} icon={AlertTriangle} tone="red" />
        <StatCard label="بلاغات اليوم" value={metrics.reportsToday} icon={Clock3} tone="yellow" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <RecentReports reports={recentReports} />
        <ReportBreakdown reports={reports} />
      </div>
    </AppShell>
  );
}
