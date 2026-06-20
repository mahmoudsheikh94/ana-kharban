import { describe, expect, it } from "vitest";
import { evaluateSubmissionGuard, isInsideJordan, recordInvalidAttempt } from "../policy";

const baseContext = {
  blocked: false,
  userAiCallsToday: 0,
  globalAiCallsToday: 0,
  userReportsThisWeek: 0,
  duplicateFile: false,
  duplicateNearbyReport: false,
  reanalysisCountForReport: 0,
  limits: {
    userDailyAiLimit: 3,
    globalDailyAiLimit: 100,
    userWeeklyReportLimit: 10,
    maxInvalidAttempts: 3
  }
};

describe("abuse policy", () => {
  it("allows a normal first report in Jordan", () => {
    expect(
      evaluateSubmissionGuard({
        ...baseContext,
        action: "create_and_analyze",
        latitude: 31.9539,
        longitude: 35.9106
      })
    ).toEqual({ allowed: true });
  });

  it("blocks Gemini when a user reaches the daily AI limit", () => {
    expect(
      evaluateSubmissionGuard({
        ...baseContext,
        action: "create_and_analyze",
        latitude: 31.9539,
        longitude: 35.9106,
        userAiCallsToday: 3
      })
    ).toEqual({
      allowed: false,
      reason: "user_daily_ai_limit",
      mode: "manual_review"
    });
  });

  it("blocks Gemini when the global daily AI budget is exhausted", () => {
    expect(
      evaluateSubmissionGuard({
        ...baseContext,
        action: "create_and_analyze",
        latitude: 31.9539,
        longitude: 35.9106,
        globalAiCallsToday: 100
      })
    ).toEqual({
      allowed: false,
      reason: "global_daily_ai_limit",
      mode: "manual_review"
    });
  });

  it("rejects users who exceed the weekly report limit before AI", () => {
    expect(
      evaluateSubmissionGuard({
        ...baseContext,
        action: "create_and_analyze",
        latitude: 31.9539,
        longitude: 35.9106,
        userReportsThisWeek: 10
      })
    ).toEqual({
      allowed: false,
      reason: "user_weekly_report_limit",
      mode: "reject"
    });
  });

  it("rejects duplicate Telegram file IDs", () => {
    expect(
      evaluateSubmissionGuard({
        ...baseContext,
        action: "create_and_analyze",
        latitude: 31.9539,
        longitude: 35.9106,
        duplicateFile: true
      })
    ).toEqual({
      allowed: false,
      reason: "duplicate_file",
      mode: "reject"
    });
  });

  it("rejects reports outside Jordan", () => {
    expect(
      evaluateSubmissionGuard({
        ...baseContext,
        action: "create_and_analyze",
        latitude: 52.52,
        longitude: 13.405
      })
    ).toEqual({
      allowed: false,
      reason: "outside_jordan",
      mode: "reject"
    });
  });

  it("allows only one Gemini reanalysis for a report", () => {
    expect(
      evaluateSubmissionGuard({
        ...baseContext,
        action: "reanalyze_with_description",
        latitude: 31.9539,
        longitude: 35.9106,
        reanalysisCountForReport: 1
      })
    ).toEqual({
      allowed: false,
      reason: "reanalysis_limit",
      mode: "reject"
    });
  });

  it("tracks invalid attempts and locks after the configured maximum", () => {
    expect(recordInvalidAttempt(undefined, 3)).toEqual({ invalidAttempts: 1, locked: false });
    expect(recordInvalidAttempt(2, 3)).toEqual({ invalidAttempts: 3, locked: true });
  });

  it("recognizes Jordan's rough geographic bounds", () => {
    expect(isInsideJordan(31.9539, 35.9106)).toBe(true);
    expect(isInsideJordan(52.52, 13.405)).toBe(false);
  });
});
