import { EmptyState } from "@/components/empty-state";
import { PublicShell } from "@/components/public-shell";
import { ReportImage } from "@/components/report-image";
import { SeverityBadge } from "@/components/severity-badge";
import { formatDateOnly } from "@/lib/reports/format";
import type { Severity } from "@/lib/reports/types";
import { getPublicVolunteer, getVolunteerCompletedPermits } from "@/lib/supabase/public";
import { Wrench } from "lucide-react";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type VolunteerProfilePageProps = {
  params: Promise<{ id: string }>;
};

export default async function VolunteerProfilePage({ params }: VolunteerProfilePageProps) {
  const { id } = await params;
  const [volunteer, permits] = await Promise.all([
    getPublicVolunteer(id),
    getVolunteerCompletedPermits(id)
  ]);

  if (!volunteer) {
    notFound();
  }

  return (
    <PublicShell title={volunteer.display_name} subtitle="ملف متطوع عام — إجمالي النقاط والإصلاحات المكتملة.">
      <div className="grid gap-5 sm:grid-cols-2">
        <section className="rounded-lg border border-stone-200 bg-white p-5">
          <p className="text-sm font-semibold text-stone-500">إجمالي النقاط</p>
          <p className="mt-2 text-4xl font-black text-charcoal-950">{volunteer.total_points}</p>
        </section>
        <section className="rounded-lg border border-stone-200 bg-white p-5">
          <p className="text-sm font-semibold text-stone-500">إصلاحات مكتملة</p>
          <p className="mt-2 text-4xl font-black text-charcoal-950">{volunteer.completed_fixes}</p>
        </section>
      </div>

      <h3 className="mt-8 mb-4 text-lg font-black text-charcoal-950">الإصلاحات المكتملة</h3>
      {permits.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {permits.map((permit) => (
            <article key={permit.id} className="overflow-hidden rounded-lg border border-stone-200 bg-white">
              <ReportImage
                src={permit.report?.image_url ?? null}
                alt={permit.report?.ai_category ?? "إصلاح"}
                className="aspect-[4/3] w-full"
              />
              <div className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <SeverityBadge severity={(permit.report?.ai_severity ?? null) as Severity | null} />
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">
                    +{permit.points_awarded}
                  </span>
                </div>
                <p className="text-sm font-bold text-charcoal-900">{permit.report?.ai_category ?? "بلاغ"}</p>
                <p className="text-xs text-stone-500">
                  {permit.report?.city ?? "—"} · {permit.completed_at ? formatDateOnly(permit.completed_at) : ""}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={Wrench} title="لا توجد إصلاحات مكتملة بعد" message="ستظهر الإصلاحات هنا بعد اعتماد المشرف لها." />
      )}
    </PublicShell>
  );
}
