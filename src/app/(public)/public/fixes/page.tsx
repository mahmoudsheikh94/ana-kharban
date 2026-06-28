import { EmptyState } from "@/components/empty-state";
import { PublicShell } from "@/components/public-shell";
import { ReportImage } from "@/components/report-image";
import { SeverityBadge } from "@/components/severity-badge";
import { formatDateOnly } from "@/lib/reports/format";
import type { Severity } from "@/lib/reports/types";
import { getPublicFixes } from "@/lib/supabase/public";
import { Wrench } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PublicFixesPage() {
  const fixes = await getPublicFixes();

  return (
    <PublicShell
      title="معرض الإصلاحات"
      subtitle="صور الإصلاحات التي قدّمها المتطوعون كدليل على معالجة البلاغات."
    >
      {fixes.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fixes.map((fix) => (
            <article key={fix.id} className="overflow-hidden rounded-lg border border-stone-200 bg-white">
              <ReportImage src={fix.image_url} alt={fix.report?.ai_category ?? "إصلاح"} className="aspect-[4/3] w-full" />
              <div className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <SeverityBadge severity={(fix.report?.ai_severity ?? null) as Severity | null} />
                  <span className="text-xs text-stone-500">{formatDateOnly(fix.created_at)}</span>
                </div>
                <p className="text-sm font-bold text-charcoal-900">{fix.report?.ai_category ?? "بلاغ"}</p>
                {fix.description ? <p className="text-sm text-stone-600">{fix.description}</p> : null}
                <p className="text-xs text-stone-500">
                  {fix.report?.city ?? "—"} · {fix.report?.area ?? "—"}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={Wrench} title="لا توجد إصلاحات منشورة بعد" message="ستظهر الإصلاحات هنا بعد تقديمها." />
      )}
    </PublicShell>
  );
}
