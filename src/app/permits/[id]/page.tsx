import { completePermitAction, transitionPermitAction } from "@/app/permits/[id]/actions";
import { AppShell } from "@/components/app-shell";
import { PermitStatusBadge } from "@/components/permit-status-badge";
import { ReportImage } from "@/components/report-image";
import { SeverityBadge } from "@/components/severity-badge";
import { DetailGrid, DetailItem, ReportDetailSection } from "@/components/report-detail-section";
import { scoreFix } from "@/lib/rewards/scoring";
import { nextStatuses } from "@/lib/permits/transitions";
import { permitStatusMeta } from "@/lib/permits/types";
import { formatDateAr, shortId } from "@/lib/reports/format";
import type { Severity } from "@/lib/reports/types";
import { getPermitById } from "@/lib/supabase/permits";
import { CheckCircle2, MapPin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type PermitDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PermitDetailPage({ params, searchParams }: PermitDetailPageProps) {
  const { id } = await params;
  const { error } = await searchParams;
  const permit = await getPermitById(id);

  if (!permit) {
    notFound();
  }

  const severity = (permit.report?.ai_severity ?? null) as Severity | null;
  const projectedPoints = scoreFix(severity, permit.report?.ai_category ?? null);
  const transitions = nextStatuses(permit.status).filter((status) => status !== "completed");
  const submissionCount = permit.fix_submissions?.length ?? 0;
  const hasProof = submissionCount > 0;
  // Completion requires the permit to be active AND have at least one fix submission as proof.
  const canComplete = permit.status === "active" && hasProof;

  return (
    <AppShell
      title={`تصريح ${shortId(permit.id)}`}
      subtitle={`${permit.volunteer?.display_name ?? "متطوع"} · ${formatDateAr(permit.created_at)}`}
    >
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <ReportDetailSection title="حالة التصريح">
            <div className="flex flex-wrap items-center gap-3">
              <PermitStatusBadge status={permit.status} />
              <SeverityBadge severity={severity} />
              {permit.points_awarded > 0 ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                  {permit.points_awarded} نقطة ممنوحة
                </span>
              ) : (
                <span className="text-xs text-stone-500">نقاط متوقعة عند الاكتمال: {projectedPoints}</span>
              )}
            </div>
          </ReportDetailSection>

          <ReportDetailSection title="إجراءات المشرف">
            {error === "no_fix" ? (
              <p className="mb-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
                لا يمكن اعتماد الاكتمال قبل أن يرسل المتطوع صورة إصلاح واحدة على الأقل.
              </p>
            ) : null}
            {permit.status === "active" && !hasProof ? (
              <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
                بانتظار صور الإصلاح من المتطوع قبل أن يصبح الاعتماد متاحاً.
              </p>
            ) : null}
            {transitions.length === 0 && !canComplete ? (
              <p className="text-sm text-stone-500">لا توجد إجراءات متاحة لهذه الحالة.</p>
            ) : (
              <div className="space-y-4">
                {transitions.length > 0 ? (
                  <form action={transitionPermitAction} className="space-y-3">
                    <input type="hidden" name="permitId" value={permit.id} />
                    <textarea
                      name="note"
                      rows={2}
                      placeholder="ملاحظة إدارية (اختياري)"
                      className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      {transitions.map((status) => (
                        <button
                          key={status}
                          name="to"
                          value={status}
                          className="rounded-md bg-charcoal-900 px-4 py-2 text-sm font-bold text-white hover:bg-charcoal-800"
                        >
                          {permitStatusMeta[status].label}
                        </button>
                      ))}
                    </div>
                  </form>
                ) : null}

                {canComplete ? (
                  <form action={completePermitAction} className="space-y-3 border-t border-stone-200 pt-4">
                    <input type="hidden" name="permitId" value={permit.id} />
                    <textarea
                      name="note"
                      rows={2}
                      placeholder="ملاحظة الاكتمال (اختياري)"
                      className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
                    />
                    <button className="inline-flex items-center gap-2 rounded-md bg-civic-green px-4 py-2 text-sm font-bold text-white hover:opacity-90">
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      اعتماد الاكتمال ومنح {projectedPoints} نقطة
                    </button>
                  </form>
                ) : null}
              </div>
            )}
          </ReportDetailSection>

          {permit.admin_note ? (
            <ReportDetailSection title="ملاحظة المشرف">
              <p className="leading-7 text-charcoal-900">{permit.admin_note}</p>
            </ReportDetailSection>
          ) : null}
        </div>

        <div className="space-y-6">
          <ReportDetailSection title="بيانات المتطوع">
            <DetailGrid>
              <DetailItem label="الاسم" value={permit.volunteer?.display_name} />
              <DetailItem
                label="رقم الهاتف"
                value={permit.volunteer?.phone_number ? <span dir="ltr">{permit.volunteer.phone_number}</span> : null}
              />
              <DetailItem label="Telegram ID" value={permit.volunteer?.telegram_user_id} />
              <DetailItem label="إجمالي النقاط" value={String(permit.volunteer?.total_points ?? 0)} />
            </DetailGrid>
          </ReportDetailSection>

          <ReportDetailSection title="البلاغ المرتبط">
            <DetailGrid>
              <DetailItem
                label="رقم البلاغ"
                value={
                  <Link href={`/reports/${permit.report_id}`} className="text-civic-amber hover:underline">
                    {shortId(permit.report_id)}
                  </Link>
                }
              />
              <DetailItem label="التصنيف" value={permit.report?.ai_category} />
              <DetailItem label="المدينة" value={permit.report?.city} />
              <DetailItem label="المنطقة" value={permit.report?.area} />
            </DetailGrid>
          </ReportDetailSection>

          <ReportDetailSection title={`قبل / بعد — تقديمات الإصلاح (${submissionCount})`}>
            {hasProof ? (
              <div className="space-y-5">
                {permit.fix_submissions!.map((fix) => (
                  <div key={fix.id} className="rounded-lg border border-stone-200 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <figure className="space-y-1">
                        <figcaption className="text-xs font-bold text-stone-500">قبل (البلاغ)</figcaption>
                        <ReportImage
                          src={permit.report?.image_url ?? null}
                          alt="صورة البلاغ الأصلية"
                          className="aspect-[4/3] w-full"
                        />
                      </figure>
                      <figure className="space-y-1">
                        <figcaption className="text-xs font-bold text-emerald-700">بعد (الإصلاح)</figcaption>
                        <ReportImage src={fix.image_url} alt="صورة الإصلاح" className="aspect-[4/3] w-full" />
                      </figure>
                    </div>
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-stone-500">{formatDateAr(fix.created_at)}</p>
                      {fix.description ? <p className="text-sm text-charcoal-900">{fix.description}</p> : null}
                      {typeof fix.latitude === "number" && typeof fix.longitude === "number" ? (
                        <a
                          href={`https://www.google.com/maps?q=${fix.latitude},${fix.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-civic-amber hover:text-charcoal-950"
                        >
                          فتح موقع الإصلاح
                          <MapPin className="size-3.5" aria-hidden="true" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500">لا توجد تقديمات إصلاح بعد. يرسلها المتطوع عبر الزر في تيليجرام أو رابط الرفع.</p>
            )}
          </ReportDetailSection>
        </div>
      </div>
    </AppShell>
  );
}
