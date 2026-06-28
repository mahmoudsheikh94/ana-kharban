import type { Severity } from "@/lib/reports/types";

// Base points awarded for completing a fix, keyed by the report's AI severity.
const severityBasePoints: Record<Severity, number> = {
  low: 10,
  medium: 20,
  high: 35,
  urgent: 50
};

// Category multipliers. Hazardous public problems are worth more. Matching is
// substring-based and case-insensitive so it works with the free-form Arabic and
// English categories the AI produces.
const categoryMultipliers: Array<{ keywords: string[]; multiplier: number }> = [
  { keywords: ["كهرباء", "electric", "كابل", "wire"], multiplier: 1.5 },
  { keywords: ["مياه", "صرف", "تسرب", "water", "sewage", "leak"], multiplier: 1.4 },
  { keywords: ["حفرة", "طريق", "رصيف", "pothole", "road", "sidewalk"], multiplier: 1.3 },
  { keywords: ["نفايات", "قمامة", "garbage", "trash", "waste"], multiplier: 1.1 }
];

const DEFAULT_MULTIPLIER = 1.0;

export function categoryMultiplier(category: string | null | undefined): number {
  if (!category) {
    return DEFAULT_MULTIPLIER;
  }

  const normalized = category.toLowerCase();
  for (const entry of categoryMultipliers) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
      return entry.multiplier;
    }
  }

  return DEFAULT_MULTIPLIER;
}

// Compute the points for a completed fix. Severity drives the base; category scales it.
// Falls back to the `medium` base when severity is missing so an unscored report still
// rewards the volunteer fairly.
export function scoreFix(
  severity: Severity | null | undefined,
  category: string | null | undefined
): number {
  const base = severity ? severityBasePoints[severity] : severityBasePoints.medium;
  const multiplier = categoryMultiplier(category);
  return Math.round(base * multiplier);
}
