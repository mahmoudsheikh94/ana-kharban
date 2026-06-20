import type { ReportWithReporter } from "@/lib/reports/types";

function count(items: (string | null)[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    if (!item) {
      return acc;
    }

    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

export function ReportBreakdown({ reports }: { reports: ReportWithReporter[] }) {
  const byCity = Object.entries(count(reports.map((report) => report.city))).slice(0, 5);
  const byCategory = Object.entries(count(reports.map((report) => report.ai_category))).slice(0, 5);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <BreakdownPanel title="المدن الأكثر بلاغاً" rows={byCity} />
      <BreakdownPanel title="أكثر التصنيفات" rows={byCategory} />
    </div>
  );
}

function BreakdownPanel({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(...rows.map(([, value]) => value), 1);

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="font-black text-charcoal-950">{title}</h3>
      <div className="mt-5 space-y-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-charcoal-900">{label}</span>
              <span className="text-stone-500">{value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-civic-yellow" style={{ width: `${(value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
