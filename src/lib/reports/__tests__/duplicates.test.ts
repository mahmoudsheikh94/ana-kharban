import { describe, expect, it } from "vitest";
import {
  isDuplicateMatch,
  pickCanonicalDuplicate,
  type DuplicateCandidate,
  type DuplicateMatchInput
} from "../duplicates";

const base: DuplicateMatchInput = {
  reportId: "new-report",
  latitude: 31.95,
  longitude: 35.91,
  aiCategory: "حفرة طريق",
  radiusDeg: 0.0009
};

function candidate(overrides: Partial<DuplicateCandidate>): DuplicateCandidate {
  return {
    id: "old-1",
    latitude: 31.95,
    longitude: 35.91,
    ai_category: "حفرة طريق",
    created_at: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

describe("isDuplicateMatch", () => {
  it("matches a close report with the same category", () => {
    expect(isDuplicateMatch(base, candidate({ latitude: 31.9505, longitude: 35.9104 }))).toBe(true);
  });

  it("rejects a report outside the radius", () => {
    expect(isDuplicateMatch(base, candidate({ latitude: 31.96, longitude: 35.91 }))).toBe(false);
  });

  it("rejects a close report with a different category", () => {
    expect(isDuplicateMatch(base, candidate({ ai_category: "إنارة عامة" }))).toBe(false);
  });

  it("matches category case-insensitively and trimmed", () => {
    expect(isDuplicateMatch({ ...base, aiCategory: "  Pothole  " }, candidate({ ai_category: "pothole" }))).toBe(
      true
    );
  });

  it("never matches itself", () => {
    expect(isDuplicateMatch(base, candidate({ id: "new-report" }))).toBe(false);
  });

  it("never matches when the new report has no category", () => {
    expect(isDuplicateMatch({ ...base, aiCategory: null }, candidate({ ai_category: null }))).toBe(false);
  });
});

describe("pickCanonicalDuplicate", () => {
  it("returns null with no matches", () => {
    expect(pickCanonicalDuplicate(base, [candidate({ ai_category: "أخرى" })])).toBeNull();
  });

  it("returns the oldest matching report", () => {
    const result = pickCanonicalDuplicate(base, [
      candidate({ id: "newer", created_at: "2026-06-10T00:00:00.000Z" }),
      candidate({ id: "older", created_at: "2026-05-01T00:00:00.000Z" }),
      candidate({ id: "far", latitude: 32.5, created_at: "2026-04-01T00:00:00.000Z" })
    ]);
    expect(result).toBe("older");
  });
});
