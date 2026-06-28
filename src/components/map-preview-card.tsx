import { formatPercent } from "@/lib/reports/format";
import type { ReportWithReporter } from "@/lib/reports/types";
import Link from "next/link";
import { ReportImage } from "./report-image";
import { SeverityBadge } from "./severity-badge";
import { PublicStatusBadge } from "./status-badge";

// When `volunteerBotUsername` is set (the public map), the card shows a Telegram
// deep-link CTA to volunteer for this report instead of the admin-only details link.
export function MapPreviewCard({
  report,
  volunteerBotUsername
}: {
  report: ReportWithReporter;
  volunteerBotUsername?: string;
}) {
  return (
    <article className="w-72 rounded-lg border border-stone-200 bg-white p-3 text-right shadow-panel">
      <ReportImage src={report.image_url} alt={report.ai_category ?? "صورة البلاغ"} className="h-32 w-full" priority />
      <div className="mt-3 flex flex-wrap gap-2">
        <SeverityBadge severity={report.ai_severity} />
        <PublicStatusBadge status={report.public_status} />
      </div>
      <h3 className="mt-3 font-black text-charcoal-950">{report.ai_category ?? "بلاغ غير مصنف"}</h3>
      <p className="mt-1 text-sm text-stone-600">
        {report.city ?? "مدينة غير محددة"} - {report.area ?? "منطقة غير محددة"}
      </p>
      <p className="mt-2 text-sm font-bold text-charcoal-900">ثقة AI: {formatPercent(report.ai_confidence)}</p>
      {volunteerBotUsername ? (
        <a
          href={`https://t.me/${volunteerBotUsername}?start=fix_${report.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
        >
          تطوّع لإصلاح هذا البلاغ
        </a>
      ) : (
        <Link
          href={`/reports/${report.id}`}
          className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-charcoal-900 px-3 py-2 text-sm font-bold text-white hover:bg-charcoal-800"
        >
          فتح التفاصيل
        </Link>
      )}
    </article>
  );
}
