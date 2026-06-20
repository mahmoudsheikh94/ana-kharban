import { describe, expect, it } from "vitest";
import { normalizeTelegramUpdate } from "../update";

describe("Telegram update normalization", () => {
  it("extracts text updates", () => {
    const input = normalizeTelegramUpdate({
      message: {
        message_id: 10,
        from: { id: 20 },
        chat: { id: 30 },
        text: "مرحبا"
      }
    });

    expect(input).toEqual({
      kind: "text",
      text: "مرحبا",
      messageId: 10,
      telegramUserId: "20",
      chatId: "30"
    });
  });

  it("chooses the largest Telegram photo", () => {
    const input = normalizeTelegramUpdate({
      message: {
        message_id: 10,
        from: { id: 20 },
        chat: { id: 30 },
        photo: [
          { file_id: "small", width: 90, height: 90 },
          { file_id: "large", width: 1280, height: 960 }
        ]
      }
    });

    expect(input).toMatchObject({
      kind: "photo",
      fileId: "large"
    });
  });
});
