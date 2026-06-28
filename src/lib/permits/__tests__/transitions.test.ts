import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, isTerminal, nextStatuses } from "../transitions";

describe("permit transitions", () => {
  it("allows the happy-path lifecycle", () => {
    expect(canTransition("pending", "approved")).toBe(true);
    expect(canTransition("approved", "active")).toBe(true);
    expect(canTransition("active", "completed")).toBe(true);
  });

  it("allows rejecting a pending permit and cancelling live ones", () => {
    expect(canTransition("pending", "rejected")).toBe(true);
    expect(canTransition("approved", "cancelled")).toBe(true);
    expect(canTransition("active", "cancelled")).toBe(true);
  });

  it("forbids illegal jumps", () => {
    expect(canTransition("pending", "completed")).toBe(false);
    expect(canTransition("pending", "active")).toBe(false);
    expect(canTransition("completed", "active")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
  });

  it("treats completed, rejected, and cancelled as terminal", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("pending")).toBe(false);
    expect(nextStatuses("completed")).toEqual([]);
  });

  it("throws on an illegal transition", () => {
    expect(() => assertTransition("active", "approved")).toThrow(/Illegal permit transition/);
    expect(() => assertTransition("active", "completed")).not.toThrow();
  });
});
