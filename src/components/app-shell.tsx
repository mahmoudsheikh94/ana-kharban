import { logoutAction } from "@/app/login/actions";
import { BarChart3, LogOut, Map, Table2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "الرئيسية", icon: BarChart3 },
  { href: "/reports", label: "البلاغات", icon: Table2 },
  { href: "/map", label: "الخريطة", icon: Map }
];

export function AppShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="min-h-screen bg-stone-100 text-charcoal-900 lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="border-b border-white/10 bg-charcoal-950 text-white lg:min-h-screen lg:border-b-0">
        <div className="flex items-center justify-between gap-4 px-5 py-5 lg:block lg:px-6">
          <Link href="/dashboard" className="block">
            <p className="text-xs text-civic-yellow">لوحة البلاغات المدنية</p>
            <h1 className="mt-1 text-2xl font-black">أنا خربان</h1>
          </Link>
          <form action={logoutAction} className="lg:hidden">
            <button className="rounded-md p-2 text-white/75 hover:bg-white/10 hover:text-white" aria-label="تسجيل الخروج">
              <LogOut className="size-5" aria-hidden="true" />
            </button>
          </form>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-5 pb-5 lg:block lg:space-y-2 lg:px-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-w-fit items-center gap-3 rounded-md px-4 py-3 text-sm font-semibold text-white/78 transition hover:bg-white/10 hover:text-white lg:flex"
            >
              <item.icon className="size-5 text-civic-yellow" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>

        <form action={logoutAction} className="hidden px-4 pt-6 lg:block">
          <button className="inline-flex w-full items-center gap-3 rounded-md px-4 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white">
            <LogOut className="size-5" aria-hidden="true" />
            تسجيل الخروج
          </button>
        </form>
      </aside>

      <main className="min-w-0">
        <header className="border-b border-stone-200 bg-white px-5 py-5 lg:px-8">
          <p className="text-sm font-semibold text-civic-amber">إدارة البلاغات</p>
          <h2 className="mt-1 text-2xl font-black tracking-normal text-charcoal-950">{title}</h2>
          {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{subtitle}</p> : null}
        </header>
        <div className="px-5 py-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
