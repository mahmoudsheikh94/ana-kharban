import { describe, expect, it } from "vitest";
import {
  formatDateAr,
  formatPercent,
  publicStatusMeta,
  severityMeta,
  validationStatusMeta
} from "../format";

describe("report formatting", () => {
  it("formats dates in Arabic for Jordan dashboard users", () => {
    expect(formatDateAr("2026-06-20T10:30:00.000Z")).toContain("حزيران");
  });

  it("formats confidence as a rounded percentage", () => {
    expect(formatPercent(0.936)).toBe("94%");
    expect(formatPercent(null)).toBe("غير متوفر");
  });

  it("returns Arabic metadata for severity and statuses", () => {
    expect(severityMeta.urgent.label).toBe("عاجلة");
    expect(validationStatusMeta.approved.label).toBe("معتمد");
    expect(publicStatusMeta.acknowledged.label).toBe("تم الاستلام");
  });
});
