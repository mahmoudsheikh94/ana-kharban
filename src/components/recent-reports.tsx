import { formatDateAr, formatPercent, shortId } from "@/lib/reports/format";
import type { ReportWithReporter } from "@/lib/reports/types";
import Link from "next/link";
import { ReportImage } from "./report-image";
import { SeverityBadge } from "./severity-badge";
import { ValidationStatusBadge } from "./status-badge";

export function RecentReports({ reports }: { reports: ReportWithReporter[] }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-200 px-5 py-4">
        <h3 className="font-black text-charcoal-950">أحدث البلاغات</h3>
      </div>
      <div className="divide-y divide-stone-100">
        {reports.map((report) => (
          <Link
            key={report.id}
            href={`/reports/${report.id}`}
            className="grid gap-4 px-5 py-4 transition hover:bg-stone-50 sm:grid-cols-[72px_1fr_auto]"
          >
            <ReportImage src={report.image_url} alt={report.ai_category ?? "صورة البلاغ"} className="h-16 w-20" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-stone-500">{shortId(report.id)}</span>
                <SeverityBadge severity={report.ai_severity} />
                <ValidationStatusBadge status={report.ai_validation_status} />
              </div>
              <p className="mt-2 truncate font-bold text-charcoal-950">{report.ai_category ?? "بلاغ غير مصنف"}</p>
              <p className="mt-1 text-sm text-stone-500">
                {report.city ?? "مدينة غير محددة"} - {report.area ?? "منطقة غير محددة"} · {formatDateAr(report.created_at)}
              </p>
            </div>
            <div className="text-sm font-bold text-charcoal-900 sm:text-left">
              ثقة AI
              <span className="mt-1 block text-lg">{formatPercent(report.ai_confidence)}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
