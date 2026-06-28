import { PublicShell } from "@/components/public-shell";
import { getPublicStats } from "@/lib/supabase/public";
import { FileCheck2, Map, Trophy, Users, Wrench } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PublicLandingPage() {
  const stats = await getPublicStats();

  const cards = [
    { label: "بلاغات معتمدة", value: stats.approvedReports, icon: FileCheck2 },
    { label: "إصلاحات منشورة", value: stats.fixes, icon: Wrench },
    { label: "متطوعون", value: stats.volunteers, icon: Users }
  ];

  const links = [
    { href: "/public/map", label: "خريطة البلاغات المعتمدة", icon: Map },
    { href: "/public/leaderboard", label: "لوحة شرف المتطوعين", icon: Trophy },
    { href: "/public/fixes", label: "معرض الإصلاحات", icon: Wrench }
  ];

  return (
    <PublicShell
      title="الشفافية المدنية في الأردن"
      subtitle="تابع البلاغات المعتمدة، الإصلاحات التي أنجزها المتطوعون، ولوحة شرف المساهمين — كل ذلك علناً وبدون تسجيل دخول."
    >
      <div className="grid gap-5 sm:grid-cols-3">
        {cards.map((card) => (
          <section key={card.label} className="rounded-lg border border-stone-200 bg-white p-5 shadow-panel">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-civic-yellow/20 text-civic-amber">
                <card.icon className="size-5" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-stone-500">{card.label}</p>
            </div>
            <p className="mt-3 text-4xl font-black text-charcoal-950">{card.value}</p>
          </section>
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-5 font-bold text-charcoal-900 transition hover:border-civic-amber hover:shadow-panel"
          >
            <link.icon className="size-5 text-civic-amber" aria-hidden="true" />
            {link.label}
          </Link>
        ))}
      </div>
    </PublicShell>
  );
}
