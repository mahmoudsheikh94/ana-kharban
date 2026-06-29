import { describe, expect, it } from "vitest";
import { nextTier, tierForPoints, tiers } from "../tiers";

describe("reward tiers", () => {
  it("maps points to the correct tier (highest threshold met)", () => {
    expect(tierForPoints(0).key).toBe("newcomer");
    expect(tierForPoints(49).key).toBe("newcomer");
    expect(tierForPoints(50).key).toBe("active");
    expect(tierForPoints(149).key).toBe("active");
    expect(tierForPoints(150).key).toBe("champion");
    expect(tierForPoints(400).key).toBe("hero");
    expect(tierForPoints(5000).key).toBe("legend");
  });

  it("every tier has a label and badge", () => {
    for (const tier of tiers) {
      expect(tier.label.length).toBeGreaterThan(0);
      expect(tier.badge.length).toBeGreaterThan(0);
    }
  });

  it("reports the next tier and points remaining", () => {
    expect(nextTier(0)).toEqual({ tier: tiers[1], pointsToGo: 50 });
    expect(nextTier(120)).toEqual({ tier: tiers[2], pointsToGo: 30 });
  });

  it("returns null for the top tier", () => {
    expect(nextTier(1000)).toBeNull();
    expect(nextTier(99999)).toBeNull();
  });
});
