import { tierForPoints } from "@/lib/rewards/tiers";
import { cn } from "@/lib/utils";

// A volunteer's recognition tier, derived purely from their cumulative points.
export function TierBadge({ points, className }: { points: number; className?: string }) {
  const tier = tierForPoints(points);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1",
        tier.className,
        className
      )}
    >
      <span aria-hidden="true">{tier.badge}</span>
      {tier.label}
    </span>
  );
}
