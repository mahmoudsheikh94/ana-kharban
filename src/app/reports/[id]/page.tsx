import { AppShell } from "@/components/app-shell";
import { DuplicatePanel } from "@/components/duplicate-panel";
import { ReportAdminActions } from "@/components/report-admin-actions";
import { DetailGrid, DetailItem, ReportDetailSection } from "@/components/report-detail-section";
import { ReportImage } from "@/components/report-image";
import { SeverityBadge } from "@/components/severity-badge";
import { PublicStatusBadge, ValidationStatusBadge } from "@/components/status-badge";
import { StatusHistory } from "@/components/status-history";
import { formatDateAr, formatPercent, shortId } from "@/lib/reports/format";
import { getReportById } from "@/lib/supabase/reports";
import { MapPin } from "lucide-react";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type ReportDetailsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ReportDetailsPage({ params }: ReportDetailsPageProps) {
  const { id } = await params;
  const report = await getReportById(id);

  if (!report) {
    notFound();
  }

  const mapsUrl = `https://www.google.com/maps?q=${report.latitude},${report.longitude}`;

  return (
    <AppShell
      title={`تفاصيل البلاغ ${shortId(report.id)}`}
      subtitle={`${report.city ?? "مدينة غير محددة"} - ${report.area ?? "منطقة غير محددة"} · ${formatDateAr(report.created_at)}`}
    >
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <ReportDetailSection title="الصورة المرفوعة">
            <ReportImage
              src={report.image_url}
              alt={report.ai_category ?? "صورة البلاغ"}
              className="aspect-[4/3] w-full"
              priority
            />
          </ReportDetailSection>

          <ReportDetailSection title="حالة البلاغ">
            <div className="flex flex-wrap gap-3">
              <SeverityBadge severity={report.ai_severity} />
              <ValidationStatusBadge status={report.ai_validation_status} />
              <PublicStatusBadge status={report.public_status} />
            </div>
            {(report.possible_duplicate_of || report.duplicate_of) && (
              <div className="mt-4">
                <DuplicatePanel report={report} />
              </div>
            )}
          </ReportDetailSection>

          <ReportDetailSection title="تحديث إداري">
            <ReportAdminActions report={report} />
          </ReportDetailSection>

          <ReportDetailSection title="تاريخ الحالة">
            <StatusHistory report={report} />
          </ReportDetailSection>
        </div>

        <div className="space-y-6">
          <ReportDetailSection title="بيانات المواطن">
            <DetailGrid>
              <DetailItem label="الاسم الكامل" value={report.reporter?.full_name} />
              <DetailItem label="رقم الهاتف" value={<span dir="ltr">{report.reporter?.phone_number}</span>} />
              <DetailItem label="Telegram User ID" value={report.reporter?.telegram_user_id} />
              <DetailItem label="تاريخ الإنشاء" value={formatDateAr(report.created_at)} />
            </DetailGrid>
          </ReportDetailSection>

          <ReportDetailSection title="الموقع">
            <DetailGrid>
              <DetailItem label="المدينة" value={report.city} />
              <DetailItem label="المنطقة" value={report.area} />
              <DetailItem label="GPS" value={<span dir="ltr">{`${report.latitude}, ${report.longitude}`}</span>} />
              <DetailItem
                label="رابط الخرائط"
                value={
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-civic-amber hover:text-charcoal-950"
                  >
                    فتح Google Maps
                    <MapPin className="size-4" aria-hidden="true" />
                  </a>
                }
              />
            </DetailGrid>
          </ReportDetailSection>

          <ReportDetailSection title="تحليل الذكاء الاصطناعي">
            <DetailGrid>
              <DetailItem label="التصنيف" value={report.ai_category} />
              <DetailItem label="درجة الثقة" value={formatPercent(report.ai_confidence)} />
              <DetailItem label="نتيجة التحقق" value={report.ai_validation_status} />
              <DetailItem label="سبب التحقق" value={report.ai_validation_reason} />
            </DetailGrid>
            <div className="mt-4 rounded-md bg-stone-50 p-4">
              <p className="text-xs font-bold text-stone-500">AI Image Analysis</p>
              <p className="mt-2 leading-7 text-charcoal-900">{report.ai_image_analysis ?? "غير متوفر"}</p>
            </div>
          </ReportDetailSection>

          <ReportDetailSection title="نص الشكوى العربي المولد">
            <p className="rounded-md bg-yellow-50 p-4 leading-8 text-charcoal-950 ring-1 ring-yellow-200">
              {report.generated_complaint_arabic ?? "لم يتم توليد نص شكوى بعد."}
            </p>
          </ReportDetailSection>
        </div>
      </div>
    </AppShell>
  );
}
