// Pure, DB-free logic for cross-user duplicate-report detection.
//
// A new report is a *possible duplicate* of an existing live report when they are
// geographically close AND share the same issue type (ai_category). This module decides
// "is this candidate a match?" and "which candidate is the canonical original?". The DB
// query (in lib/supabase/reports.ts) pre-filters by a bounding box + category for speed;
// these functions apply the exact predicate and pick the winner.

export type DuplicateCandidate = {
  id: string;
  latitude: number;
  longitude: number;
  ai_category: string | null;
  created_at: string;
};

export type DuplicateMatchInput = {
  reportId: string;
  latitude: number;
  longitude: number;
  aiCategory: string | null;
  radiusDeg: number;
};

function normalizeCategory(category: string | null): string {
  return (category ?? "").trim().toLowerCase();
}

// True when `candidate` is within the bounding box of (lat,lng) and shares the category.
// Self (same id) and rows with no/blank category never match.
export function isDuplicateMatch(
  input: DuplicateMatchInput,
  candidate: DuplicateCandidate
): boolean {
  if (candidate.id === input.reportId) {
    return false;
  }

  const category = normalizeCategory(input.aiCategory);
  if (!category || normalizeCategory(candidate.ai_category) !== category) {
    return false;
  }

  const withinLat = Math.abs(candidate.latitude - input.latitude) <= input.radiusDeg;
  const withinLng = Math.abs(candidate.longitude - input.longitude) <= input.radiusDeg;
  return withinLat && withinLng;
}

// From a candidate pool, return the oldest matching report's id (the canonical original),
// or null when nothing matches.
export function pickCanonicalDuplicate(
  input: DuplicateMatchInput,
  candidates: DuplicateCandidate[]
): string | null {
  const matches = candidates.filter((candidate) => isDuplicateMatch(input, candidate));
  if (matches.length === 0) {
    return null;
  }

  const oldest = matches.reduce((earliest, candidate) =>
    new Date(candidate.created_at).getTime() < new Date(earliest.created_at).getTime()
      ? candidate
      : earliest
  );
  return oldest.id;
}
