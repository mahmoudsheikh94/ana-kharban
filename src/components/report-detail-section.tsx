import type { ReactNode } from "react";

export function ReportDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-black text-charcoal-950">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-4 sm:grid-cols-2">{children}</dl>;
}

export function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-stone-50 p-4">
      <dt className="text-xs font-bold text-stone-500">{label}</dt>
      <dd className="mt-2 break-words text-sm font-bold text-charcoal-950">{value || "غير متوفر"}</dd>
    </div>
  );
}
