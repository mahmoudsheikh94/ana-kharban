import { describe, expect, it } from "vitest";
import { buildNextStep, createInitialConversation } from "../flow";

describe("telegram reporting flow", () => {
  it("starts a reporting conversation from /start", () => {
    const result = buildNextStep(null, {
      kind: "text",
      text: "/start",
      chatId: "10",
      telegramUserId: "20",
      messageId: 1
    });

    expect(result.conversation.state).toBe("awaiting_full_name");
    expect(result.reply).toContain("الاسم الكامل");
  });

  it("creates and analyzes immediately after location without asking for a description", () => {
    const started = createInitialConversation("20", "10");
    const name = buildNextStep(started, {
      kind: "text",
      text: "ليان أبو زيد",
      chatId: "10",
      telegramUserId: "20",
      messageId: 2
    });
    const phone = buildNextStep(name.conversation, {
      kind: "text",
      text: "+962790000101",
      chatId: "10",
      telegramUserId: "20",
      messageId: 3
    });
    const photo = buildNextStep(phone.conversation, {
      kind: "photo",
      fileId: "photo-file",
      chatId: "10",
      telegramUserId: "20",
      messageId: 4
    });
    const location = buildNextStep(photo.conversation, {
      kind: "location",
      latitude: 31.9539,
      longitude: 35.9106,
      chatId: "10",
      telegramUserId: "20",
      messageId: 5
    });

    expect(location.readyToSubmit).toBe(true);
    expect(location.action).toBe("create_and_analyze");
    expect(location.conversation.state).toBe("awaiting_ai_confirmation");
    expect(location.reply).not.toContain("وصف");
    expect(location.conversation.draft).toMatchObject({
      fullName: "ليان أبو زيد",
      phoneNumber: "+962790000101",
      photoFileId: "photo-file",
      latitude: 31.9539,
      longitude: 35.9106
    });
  });

  it("confirms AI analysis and clears the reporting flow", () => {
    const result = buildNextStep(
      {
        telegramUserId: "20",
        chatId: "10",
        state: "awaiting_ai_confirmation",
        draft: { reportId: "report-1" }
      },
      {
        kind: "text",
        text: "نعم",
        chatId: "10",
        telegramUserId: "20",
        messageId: 8
      }
    );

    expect(result.action).toBe("confirm_ai");
    expect(result.conversation.state).toBe("idle");
    expect(result.conversation.draft.reportId).toBe("report-1");
  });

  it("asks for a correction description when the citizen rejects AI analysis", () => {
    const result = buildNextStep(
      {
        telegramUserId: "20",
        chatId: "10",
        state: "awaiting_ai_confirmation",
        draft: { reportId: "report-1" }
      },
      {
        kind: "text",
        text: "لا",
        chatId: "10",
        telegramUserId: "20",
        messageId: 8
      }
    );

    expect(result.readyToSubmit).toBe(false);
    expect(result.conversation.state).toBe("awaiting_correction_description");
    expect(result.reply).toContain("اكتب");
  });

  it("re-analyzes with a citizen correction description", () => {
    const result = buildNextStep(
      {
        telegramUserId: "20",
        chatId: "10",
        state: "awaiting_correction_description",
        draft: { reportId: "report-1" }
      },
      {
        kind: "text",
        text: "المشكلة غطاء منهل مفتوح وليس حفرة",
        chatId: "10",
        telegramUserId: "20",
        messageId: 9
      }
    );

    expect(result.readyToSubmit).toBe(true);
    expect(result.action).toBe("reanalyze_with_description");
    expect(result.conversation.state).toBe("idle");
    expect(result.conversation.draft.userDescription).toBe("المشكلة غطاء منهل مفتوح وليس حفرة");
  });

  it("rejects an invalid phone number without advancing state", () => {
    const conversation = {
      ...createInitialConversation("20", "10"),
      state: "awaiting_phone" as const,
      draft: { fullName: "ليان أبو زيد" }
    };

    const result = buildNextStep(conversation, {
      kind: "text",
      text: "abc",
      chatId: "10",
      telegramUserId: "20",
      messageId: 3
    });

    expect(result.conversation.state).toBe("awaiting_phone");
    expect(result.reply).toContain("رقم هاتف صحيح");
    expect(result.invalidAttempt).toBe(true);
  });

  it("marks random text at the photo step as an invalid attempt", () => {
    const conversation = {
      ...createInitialConversation("20", "10"),
      state: "awaiting_photo" as const,
      draft: { fullName: "ليان أبو زيد", phoneNumber: "+962790000101" }
    };

    const result = buildNextStep(conversation, {
      kind: "text",
      text: "ما رأيك بهذه المشكلة؟",
      chatId: "10",
      telegramUserId: "20",
      messageId: 4
    });

    expect(result.conversation.state).toBe("awaiting_photo");
    expect(result.invalidAttempt).toBe(true);
  });
});
