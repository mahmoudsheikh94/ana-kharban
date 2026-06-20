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

  it("collects name, phone, photo, location, and description", () => {
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
    const description = buildNextStep(location.conversation, {
      kind: "text",
      text: "حفرة كبيرة في الشارع",
      chatId: "10",
      telegramUserId: "20",
      messageId: 6
    });

    expect(description.readyToSubmit).toBe(true);
    expect(description.conversation.draft).toMatchObject({
      fullName: "ليان أبو زيد",
      phoneNumber: "+962790000101",
      photoFileId: "photo-file",
      latitude: 31.9539,
      longitude: 35.9106,
      userDescription: "حفرة كبيرة في الشارع"
    });
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
  });
});
