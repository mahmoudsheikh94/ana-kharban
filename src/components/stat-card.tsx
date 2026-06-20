import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral"
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "neutral" | "yellow" | "red" | "green";
}) {
  const toneClass = {
    neutral: "bg-charcoal-900 text-white",
    yellow: "bg-civic-yellow text-charcoal-950",
    red: "bg-civic-red text-white",
    green: "bg-civic-green text-white"
  }[tone];

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-stone-500">{label}</p>
          <p className="mt-3 text-3xl font-black text-charcoal-950">{value}</p>
        </div>
        <div className={`flex size-11 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
