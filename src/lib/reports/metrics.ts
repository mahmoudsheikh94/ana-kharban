import type { DashboardMetrics, ReportWithReporter } from "./types";

function sameUtcDay(left: Date, right: Date) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

export function calculateDashboardMetrics(
  reports: ReportWithReporter[],
  now: Date = new Date()
): DashboardMetrics {
  return reports.reduce<DashboardMetrics>(
    (metrics, report) => {
      metrics.totalReports += 1;

      if (report.ai_validation_status === "approved") {
        metrics.approvedReports += 1;
      }

      if (report.ai_validation_status === "rejected") {
        metrics.rejectedReports += 1;
      }

      if (report.ai_validation_status === "pending") {
        metrics.pendingAiReview += 1;
      }

      if (report.ai_severity === "high" || report.ai_severity === "urgent") {
        metrics.highSeverityReports += 1;
      }

      if (sameUtcDay(new Date(report.created_at), now)) {
        metrics.reportsToday += 1;
      }

      return metrics;
    },
    {
      totalReports: 0,
      approvedReports: 0,
      rejectedReports: 0,
      pendingAiReview: 0,
      highSeverityReports: 0,
      reportsToday: 0
    }
  );
}

export function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<T, number>>(
    (counts, item) => {
      counts[item] = (counts[item] ?? 0) + 1;
      return counts;
    },
    {} as Record<T, number>
  );
}
