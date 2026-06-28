import { describe, expect, it } from "vitest";
import { categoryMultiplier, scoreFix } from "../scoring";

describe("rewards scoring", () => {
  it("scores by severity base with a default multiplier", () => {
    expect(scoreFix("low", "غير مصنف")).toBe(10);
    expect(scoreFix("medium", "غير مصنف")).toBe(20);
    expect(scoreFix("high", "غير مصنف")).toBe(35);
    expect(scoreFix("urgent", "غير مصنف")).toBe(50);
  });

  it("applies category multipliers for hazardous categories", () => {
    // urgent base 50 * electricity multiplier 1.5 = 75
    expect(scoreFix("urgent", "خطر كهرباء مكشوف")).toBe(75);
    // medium base 20 * water multiplier 1.4 = 28
    expect(scoreFix("medium", "تسرب مياه")).toBe(28);
    // high base 35 * road multiplier 1.3 = 45.5 -> rounds to 46
    expect(scoreFix("high", "حفرة في الطريق")).toBe(46);
  });

  it("matches category keywords case-insensitively in English too", () => {
    expect(categoryMultiplier("Exposed Electric Wire")).toBe(1.5);
    expect(categoryMultiplier("Road pothole")).toBe(1.3);
  });

  it("falls back to medium base when severity is missing", () => {
    expect(scoreFix(null, "غير مصنف")).toBe(20);
    expect(scoreFix(undefined, null)).toBe(20);
  });

  it("returns the default multiplier for unknown categories", () => {
    expect(categoryMultiplier("something unrelated")).toBe(1.0);
    expect(categoryMultiplier(null)).toBe(1.0);
  });
});
