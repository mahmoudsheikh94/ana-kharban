import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PermitStatusBadge } from "@/components/permit-status-badge";
import { SeverityBadge } from "@/components/severity-badge";
import { permitStatusMeta, permitStatusOptions, type PermitStatus } from "@/lib/permits/types";
import { formatDateAr, shortId } from "@/lib/reports/format";
import type { Severity } from "@/lib/reports/types";
import { getPermits } from "@/lib/supabase/permits";
import { ClipboardList } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type PermitsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parseStatus(value: string | string[] | undefined): PermitStatus | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && (permitStatusOptions as string[]).includes(raw) ? (raw as PermitStatus) : undefined;
}

export default async function PermitsPage({ searchParams }: PermitsPageProps) {
  const status = parseStatus((await searchParams).status);
  const permits = await getPermits(status);

  return (
    <AppShell
      title="التصاريح"
      subtitle="إدارة تصاريح المتطوعين لإصلاح البلاغات المعتمدة عبر مراحل: بانتظار، موافقة، تنفيذ، اكتمال."
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <Link
          href="/permits"
          className={`rounded-full px-4 py-2 text-sm font-bold ring-1 ${
            status ? "bg-white text-stone-600 ring-stone-200" : "bg-charcoal-900 text-white ring-charcoal-900"
          }`}
        >
          الكل
        </Link>
        {permitStatusOptions.map((option) => (
          <Link
            key={option}
            href={`/permits?status=${option}`}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 ${
              status === option
                ? "bg-charcoal-900 text-white ring-charcoal-900"
                : "bg-white text-stone-600 ring-stone-200"
            }`}
          >
            {permitStatusMeta[option].label}
          </Link>
        ))}
      </div>

      {permits.length > 0 ? (
        <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-right text-xs font-bold uppercase text-stone-500">
                <tr>
                  <th className="px-5 py-3">التصريح</th>
                  <th className="px-5 py-3">المتطوع</th>
                  <th className="px-5 py-3">البلاغ</th>
                  <th className="px-5 py-3">الخطورة</th>
                  <th className="px-5 py-3">الحالة</th>
                  <th className="px-5 py-3">النقاط</th>
                  <th className="px-5 py-3">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {permits.map((permit) => (
                  <tr key={permit.id} className="hover:bg-stone-50">
                    <td className="px-5 py-3">
                      <Link href={`/permits/${permit.id}`} className="font-mono text-xs text-civic-amber hover:underline">
                        {shortId(permit.id)}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-semibold text-charcoal-900">
                      {permit.volunteer?.display_name ?? "—"}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-stone-500">{shortId(permit.report_id)}</td>
                    <td className="px-5 py-3">
                      <SeverityBadge severity={(permit.report?.ai_severity ?? null) as Severity | null} />
                    </td>
                    <td className="px-5 py-3">
                      <PermitStatusBadge status={permit.status} />
                    </td>
                    <td className="px-5 py-3 font-black text-charcoal-950">
                      {permit.points_awarded > 0 ? permit.points_awarded : "—"}
                    </td>
                    <td className="px-5 py-3 text-stone-500">{formatDateAr(permit.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="لا توجد تصاريح"
          message="ستظهر التصاريح هنا عندما يتطوع مواطن لإصلاح بلاغ معتمد عبر /fix في تيليجرام."
        />
      )}
    </AppShell>
  );
}
