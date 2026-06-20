import { formatDateAr, formatPercent, shortId } from "@/lib/reports/format";
import type { ReportWithReporter } from "@/lib/reports/types";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { SeverityBadge } from "./severity-badge";
import { ValidationStatusBadge } from "./status-badge";

export function ReportsTable({ reports }: { reports: ReportWithReporter[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-right text-sm">
          <thead className="bg-charcoal-900 text-white">
            <tr>
              <Header>رقم البلاغ</Header>
              <Header>الاسم الكامل</Header>
              <Header>الهاتف</Header>
              <Header>التصنيف</Header>
              <Header>الخطورة</Header>
              <Header>الحالة</Header>
              <Header>المنطقة</Header>
              <Header>تاريخ الإنشاء</Header>
              <Header>ثقة AI</Header>
              <Header>التفاصيل</Header>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {reports.map((report) => (
              <tr key={report.id} className="transition hover:bg-stone-50">
                <Cell className="font-mono text-xs text-stone-600">{shortId(report.id)}</Cell>
                <Cell className="font-bold text-charcoal-950">{report.reporter?.full_name ?? "غير معروف"}</Cell>
                <Cell dir="ltr" className="text-left font-mono text-xs">
                  {report.reporter?.phone_number ?? "-"}
                </Cell>
                <Cell>{report.ai_category ?? "غير مصنف"}</Cell>
                <Cell>
                  <SeverityBadge severity={report.ai_severity} />
                </Cell>
                <Cell>
                  <ValidationStatusBadge status={report.ai_validation_status} />
                </Cell>
                <Cell>
                  {report.city ?? "-"} / {report.area ?? "-"}
                </Cell>
                <Cell>{formatDateAr(report.created_at)}</Cell>
                <Cell className="font-bold">{formatPercent(report.ai_confidence)}</Cell>
                <Cell>
                  <Link
                    href={`/reports/${report.id}`}
                    className="inline-flex items-center gap-1 rounded-md bg-civic-yellow px-3 py-1.5 text-xs font-black text-charcoal-950 hover:bg-yellow-300"
                  >
                    فتح
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </Link>
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 text-xs font-black">{children}</th>;
}

function Cell({
  children,
  className = "",
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { children: React.ReactNode }) {
  return (
    <td className={`whitespace-nowrap px-4 py-4 align-middle ${className}`} {...props}>
      {children}
    </td>
  );
}
