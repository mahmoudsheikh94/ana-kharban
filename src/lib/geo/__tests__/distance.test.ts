import { describe, expect, it } from "vitest";
import { FIX_PROXIMITY_METERS, haversineMeters, isWithinProximity } from "../distance";

describe("haversine distance", () => {
  it("is zero for identical points", () => {
    expect(haversineMeters(31.95, 35.91, 31.95, 35.91)).toBe(0);
  });

  it("computes a known short distance accurately (~111m per 0.001 lat near Amman)", () => {
    // 0.001 degrees of latitude ≈ 111.2 m anywhere.
    const d = haversineMeters(31.95, 35.91, 31.951, 35.91);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });

  it("computes a larger known distance (Amman -> Irbid ≈ 70-75 km)", () => {
    const d = haversineMeters(31.9539, 35.9106, 32.5556, 35.85);
    expect(d).toBeGreaterThan(66_000);
    expect(d).toBeLessThan(78_000);
  });

  it("isWithinProximity accepts a near point and rejects a far one", () => {
    // ~55 m away — within the 150 m tolerance.
    expect(isWithinProximity(31.95, 35.91, 31.9505, 35.91)).toBe(true);
    // Different city — well outside.
    expect(isWithinProximity(31.95, 35.91, 32.5556, 35.85)).toBe(false);
  });

  it("respects a custom tolerance", () => {
    // ~111 m away.
    expect(isWithinProximity(31.95, 35.91, 31.951, 35.91, 50)).toBe(false);
    expect(isWithinProximity(31.95, 35.91, 31.951, 35.91, 200)).toBe(true);
  });

  it("exposes a sane default tolerance", () => {
    expect(FIX_PROXIMITY_METERS).toBe(150);
  });
});
