import { Map, Sparkles, Trophy, Wrench } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/public", label: "الرئيسية", icon: Sparkles },
  { href: "/public/map", label: "الخريطة", icon: Map },
  { href: "/public/leaderboard", label: "المتطوعون", icon: Trophy },
  { href: "/public/fixes", label: "الإصلاحات", icon: Wrench }
];

export function PublicShell({
  children,
  title,
  subtitle
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="min-h-screen bg-stone-100 text-charcoal-900">
      <header className="border-b border-stone-200 bg-charcoal-950 text-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Link href="/public" className="block">
            <p className="text-xs text-civic-yellow">منصة الشفافية المدنية</p>
            <h1 className="mt-1 text-2xl font-black">أنا خربان</h1>
          </Link>
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                <item.icon className="size-4 text-civic-yellow" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8 lg:px-8">
        <div className="mb-6">
          <h2 className="text-2xl font-black text-charcoal-950">{title}</h2>
          {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{subtitle}</p> : null}
        </div>
        {children}
      </main>

      <footer className="border-t border-stone-200 bg-white py-6 text-center text-xs text-stone-500">
        منصة عامة للشفافية — لا حاجة لتسجيل الدخول.
      </footer>
    </div>
  );
}
