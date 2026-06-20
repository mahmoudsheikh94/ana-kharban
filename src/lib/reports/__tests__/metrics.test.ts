import { describe, expect, it } from "vitest";
import { calculateDashboardMetrics } from "../metrics";
import type { ReportWithReporter } from "../types";

const reports: ReportWithReporter[] = [
  {
    id: "1",
    reporter_id: "r1",
    image_url: "image",
    latitude: 31.9,
    longitude: 35.9,
    area: "البيادر",
    city: "عمان",
    user_description: null,
    ai_category: "حفرة طريق",
    ai_severity: "urgent",
    ai_confidence: 0.9,
    ai_validation_status: "approved",
    ai_validation_reason: null,
    ai_image_analysis: null,
    generated_complaint_arabic: null,
    public_status: "sent",
    created_at: "2026-06-20T08:00:00.000Z",
    updated_at: "2026-06-20T08:00:00.000Z",
    reporter: {
      id: "r1",
      telegram_user_id: "tg1",
      full_name: "ليان",
      phone_number: "079",
      created_at: "2026-06-19T08:00:00.000Z"
    }
  },
  {
    id: "2",
    reporter_id: "r2",
    image_url: "image",
    latitude: 31.9,
    longitude: 35.9,
    area: "الحي الشمالي",
    city: "إربد",
    user_description: null,
    ai_category: "إنارة عامة",
    ai_severity: "medium",
    ai_confidence: 0.7,
    ai_validation_status: "rejected",
    ai_validation_reason: null,
    ai_image_analysis: null,
    generated_complaint_arabic: null,
    public_status: "ignored",
    created_at: "2026-06-19T08:00:00.000Z",
    updated_at: "2026-06-19T08:00:00.000Z",
    reporter: {
      id: "r2",
      telegram_user_id: "tg2",
      full_name: "أحمد",
      phone_number: "078",
      created_at: "2026-06-18T08:00:00.000Z"
    }
  }
];

describe("dashboard metrics", () => {
  it("counts reports by validation, severity, and current day", () => {
    const metrics = calculateDashboardMetrics(reports, new Date("2026-06-20T12:00:00.000Z"));

    expect(metrics.totalReports).toBe(2);
    expect(metrics.approvedReports).toBe(1);
    expect(metrics.rejectedReports).toBe(1);
    expect(metrics.pendingAiReview).toBe(0);
    expect(metrics.highSeverityReports).toBe(1);
    expect(metrics.reportsToday).toBe(1);
  });
});
