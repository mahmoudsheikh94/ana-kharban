import { describe, expect, it } from "vitest";
import { parseReportFilters } from "../filters";

describe("report filters", () => {
  it("parses supported filters from URL search params", () => {
    const filters = parseReportFilters({
      status: "approved",
      severity: "urgent",
      category: "حفرة طريق",
      city: "عمان",
      area: "البيادر",
      from: "2026-06-01",
      to: "2026-06-20"
    });

    expect(filters).toEqual({
      status: "approved",
      severity: "urgent",
      category: "حفرة طريق",
      city: "عمان",
      area: "البيادر",
      from: "2026-06-01",
      to: "2026-06-20"
    });
  });

  it("drops invalid enum and date values", () => {
    const filters = parseReportFilters({
      status: "bad",
      severity: "massive",
      from: "not-a-date",
      to: "2026-02-30"
    });

    expect(filters).toEqual({});
  });
});
