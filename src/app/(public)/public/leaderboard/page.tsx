import { EmptyState } from "@/components/empty-state";
import { PublicShell } from "@/components/public-shell";
import { TierBadge } from "@/components/tier-badge";
import { getLeaderboard } from "@/lib/supabase/public";
import { Trophy } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const rankStyles = ["bg-civic-yellow text-charcoal-950", "bg-stone-300 text-charcoal-950", "bg-civic-amber text-white"];

export default async function LeaderboardPage() {
  const volunteers = await getLeaderboard();

  return (
    <PublicShell
      title="لوحة شرف المتطوعين"
      subtitle="ترتيب المتطوعين حسب النقاط المكتسبة من إصلاح البلاغات المعتمدة."
    >
      {volunteers.length > 0 ? (
        <ol className="space-y-3">
          {volunteers.map((volunteer, index) => (
            <li key={volunteer.id}>
              <Link
                href={`/public/volunteers/${volunteer.id}`}
                className="flex items-center gap-4 rounded-lg border border-stone-200 bg-white p-4 transition hover:border-civic-amber hover:shadow-panel"
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-black ring-1 ring-stone-200 ${
                    rankStyles[index] ?? "bg-stone-100 text-stone-600"
                  }`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-charcoal-950">{volunteer.display_name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <TierBadge points={volunteer.total_points} />
                    <span className="text-xs text-stone-500">{volunteer.completed_fixes} إصلاح مكتمل</span>
                  </div>
                </div>
                <span className="rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-black text-emerald-700 ring-1 ring-emerald-200">
                  {volunteer.total_points} نقطة
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          icon={Trophy}
          title="لا يوجد متطوعون بعد"
          message="كن أول متطوع — أرسل /fix مع رقم بلاغ معتمد في بوت تيليجرام."
        />
      )}
    </PublicShell>
  );
}
