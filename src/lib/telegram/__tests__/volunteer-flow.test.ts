import { describe, expect, it } from "vitest";
import type { TelegramConversation } from "../types";
import {
  advanceFixSubmission,
  isCompleteFixDraft,
  isFixSubmissionState,
  parseVolunteerStartPayload,
  startFixSubmission
} from "../volunteer-flow";

function conversationInState(state: TelegramConversation["state"]): TelegramConversation {
  return { telegramUserId: "20", chatId: "10", state, draft: {} };
}

describe("volunteer fix-submission flow", () => {
  it("starts by asking for a fix photo", () => {
    const result = startFixSubmission({ permitId: "p1", reportId: "r1", volunteerId: "v1" });
    expect(result.state).toBe("awaiting_fix_photo");
    expect(result.reply).toContain("صورة");
    expect(result.draft.permitId).toBe("p1");
  });

  it("walks photo -> location -> description and completes", () => {
    const draft = { permitId: "p1", reportId: "r1", volunteerId: "v1" };

    const afterPhoto = advanceFixSubmission(conversationInState("awaiting_fix_photo"), draft, {
      kind: "photo",
      fileId: "fix-photo",
      chatId: "10",
      telegramUserId: "20",
      messageId: 1
    });
    expect(afterPhoto.state).toBe("awaiting_fix_location");
    expect(afterPhoto.draft.photoFileId).toBe("fix-photo");

    const afterLocation = advanceFixSubmission(
      conversationInState("awaiting_fix_location"),
      afterPhoto.draft,
      { kind: "location", latitude: 31.95, longitude: 35.91, chatId: "10", telegramUserId: "20", messageId: 2 }
    );
    expect(afterLocation.state).toBe("awaiting_fix_description");
    expect(afterLocation.draft.latitude).toBe(31.95);

    const afterDescription = advanceFixSubmission(
      conversationInState("awaiting_fix_description"),
      afterLocation.draft,
      { kind: "text", text: "تم رصف الحفرة", chatId: "10", telegramUserId: "20", messageId: 3 }
    );
    expect(afterDescription.state).toBe("idle");
    expect(afterDescription.readyToSubmit).toBe(true);
    expect(afterDescription.draft.description).toBe("تم رصف الحفرة");
    expect(isCompleteFixDraft(afterDescription.draft)).toBe(true);
  });

  it("allows skipping the description", () => {
    const draft = {
      permitId: "p1",
      reportId: "r1",
      volunteerId: "v1",
      photoFileId: "fix-photo",
      latitude: 31.95,
      longitude: 35.91
    };
    const result = advanceFixSubmission(conversationInState("awaiting_fix_description"), draft, {
      kind: "text",
      text: "/skip",
      chatId: "10",
      telegramUserId: "20",
      messageId: 4
    });
    expect(result.state).toBe("idle");
    expect(result.readyToSubmit).toBe(true);
    expect(result.draft.description).toBeNull();
  });

  it("rejects a non-photo while awaiting the fix photo", () => {
    const result = advanceFixSubmission(conversationInState("awaiting_fix_photo"), {
      permitId: "p1",
      reportId: "r1",
      volunteerId: "v1"
    }, { kind: "text", text: "مرحبا", chatId: "10", telegramUserId: "20", messageId: 5 });
    expect(result.state).toBe("awaiting_fix_photo");
    expect(result.invalidAttempt).toBe(true);
    expect(result.readyToSubmit).toBe(false);
  });

  it("recognizes its own states", () => {
    expect(isFixSubmissionState("awaiting_fix_photo")).toBe(true);
    expect(isFixSubmissionState("awaiting_fix_location")).toBe(true);
    expect(isFixSubmissionState("awaiting_fix_description")).toBe(true);
    expect(isFixSubmissionState("idle")).toBe(false);
    expect(isFixSubmissionState("awaiting_photo")).toBe(false);
  });
});

describe("parseVolunteerStartPayload", () => {
  const reportId = "11111111-2222-3333-4444-555555555555";

  it("extracts the report id from a fix_ deep-link start payload", () => {
    expect(parseVolunteerStartPayload(`/start fix_${reportId}`)).toBe(reportId);
  });

  it("trims surrounding whitespace", () => {
    expect(parseVolunteerStartPayload(`  /start fix_${reportId}  `)).toBe(reportId);
  });

  it("returns null for a bare /start", () => {
    expect(parseVolunteerStartPayload("/start")).toBeNull();
  });

  it("returns null for an unrelated start payload", () => {
    expect(parseVolunteerStartPayload("/start hello")).toBeNull();
  });

  it("returns null when the report id is not a uuid", () => {
    expect(parseVolunteerStartPayload("/start fix_not-a-uuid")).toBeNull();
  });
});
