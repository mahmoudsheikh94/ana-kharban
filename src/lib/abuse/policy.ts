export type AbuseLimits = {
  userDailyAiLimit: number;
  globalDailyAiLimit: number;
  userWeeklyReportLimit: number;
  maxInvalidAttempts: number;
};

export type SubmissionGuardReason =
  | "blocked_user"
  | "outside_jordan"
  | "duplicate_file"
  | "duplicate_nearby_report"
  | "user_weekly_report_limit"
  | "user_daily_ai_limit"
  | "global_daily_ai_limit"
  | "reanalysis_limit";

export type SubmissionGuardContext = {
  action: "create_and_analyze" | "reanalyze_with_description";
  blocked: boolean;
  latitude: number;
  longitude: number;
  userAiCallsToday: number;
  globalAiCallsToday: number;
  userReportsThisWeek: number;
  duplicateFile: boolean;
  duplicateNearbyReport: boolean;
  reanalysisCountForReport: number;
  limits: AbuseLimits;
};

export type SubmissionGuardResult =
  | { allowed: true }
  | { allowed: false; reason: SubmissionGuardReason; mode: "reject" | "manual_review" };

export function isInsideJordan(latitude: number, longitude: number) {
  return latitude >= 29.0 && latitude <= 33.4 && longitude >= 34.8 && longitude <= 39.4;
}

export function evaluateSubmissionGuard(context: SubmissionGuardContext): SubmissionGuardResult {
  if (context.blocked) {
    return { allowed: false, reason: "blocked_user", mode: "reject" };
  }

  if (!isInsideJordan(context.latitude, context.longitude)) {
    return { allowed: false, reason: "outside_jordan", mode: "reject" };
  }

  if (context.action === "create_and_analyze" && context.duplicateFile) {
    return { allowed: false, reason: "duplicate_file", mode: "reject" };
  }

  if (context.action === "create_and_analyze" && context.duplicateNearbyReport) {
    return { allowed: false, reason: "duplicate_nearby_report", mode: "reject" };
  }

  if (
    context.action === "create_and_analyze" &&
    context.userReportsThisWeek >= context.limits.userWeeklyReportLimit
  ) {
    return { allowed: false, reason: "user_weekly_report_limit", mode: "reject" };
  }

  if (context.action === "reanalyze_with_description" && context.reanalysisCountForReport >= 1) {
    return { allowed: false, reason: "reanalysis_limit", mode: "reject" };
  }

  if (context.userAiCallsToday >= context.limits.userDailyAiLimit) {
    return { allowed: false, reason: "user_daily_ai_limit", mode: "manual_review" };
  }

  if (context.globalAiCallsToday >= context.limits.globalDailyAiLimit) {
    return { allowed: false, reason: "global_daily_ai_limit", mode: "manual_review" };
  }

  return { allowed: true };
}

export function recordInvalidAttempt(currentInvalidAttempts: number | undefined, maxInvalidAttempts: number) {
  const invalidAttempts = (currentInvalidAttempts ?? 0) + 1;
  return {
    invalidAttempts,
    locked: invalidAttempts >= maxInvalidAttempts
  };
}
