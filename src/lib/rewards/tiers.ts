// Volunteer recognition tiers. Pure: cumulative points -> a named Arabic rank + badge emoji.
// Recognition only — no money, no redemption, no external dependency. Ordered ascending; the
// highest tier whose threshold is met wins.

export type Tier = {
  key: string;
  label: string;
  badge: string;
  minPoints: number;
  className: string;
};

export const tiers: Tier[] = [
  { key: "newcomer", label: "متطوع مبتدئ", badge: "🌱", minPoints: 0, className: "bg-stone-100 text-stone-700 ring-stone-200" },
  { key: "active", label: "متطوع نشيط", badge: "⭐", minPoints: 50, className: "bg-sky-50 text-sky-700 ring-sky-200" },
  { key: "champion", label: "بطل الحي", badge: "🏅", minPoints: 150, className: "bg-amber-50 text-amber-800 ring-amber-200" },
  { key: "hero", label: "بطل المدينة", badge: "🏆", minPoints: 400, className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { key: "legend", label: "أسطورة الإصلاح", badge: "👑", minPoints: 1000, className: "bg-civic-yellow/20 text-civic-amber ring-civic-yellow" }
];

export function tierForPoints(points: number): Tier {
  let current = tiers[0];
  for (const tier of tiers) {
    if (points >= tier.minPoints) {
      current = tier;
    }
  }
  return current;
}

// The next tier up, and how many points remain to reach it — for a "X نقطة للترقية" hint.
// Returns null when the volunteer is already at the top tier.
export function nextTier(points: number): { tier: Tier; pointsToGo: number } | null {
  const next = tiers.find((tier) => tier.minPoints > points);
  return next ? { tier: next, pointsToGo: next.minPoints - points } : null;
}
