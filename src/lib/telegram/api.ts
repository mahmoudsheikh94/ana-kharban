import "server-only";

import { getTelegramBotToken } from "@/lib/supabase/config";
import { resolveTelegramImageMetadata } from "./file";

const telegramApiBase = "https://api.telegram.org";

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

async function telegramRequest<T>(method: string, body: Record<string, unknown>) {
  const response = await fetch(`${telegramApiBase}/bot${getTelegramBotToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as TelegramApiResponse<T>;

  if (!response.ok || !payload.ok) {
    throw new Error(`Telegram ${method} failed: ${payload.description ?? response.statusText}`);
  }

  return payload.result as T;
}

// An inline keyboard: rows of tappable buttons. callback_data must be <= 64 bytes.
export type InlineButton = { text: string; callbackData: string };
export type InlineKeyboard = InlineButton[][];

function toReplyMarkup(keyboard: InlineKeyboard | undefined) {
  if (!keyboard) {
    return undefined;
  }
  return {
    inline_keyboard: keyboard.map((row) =>
      row.map((button) => ({ text: button.text, callback_data: button.callbackData }))
    )
  };
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: { inlineKeyboard?: InlineKeyboard }
) {
  return telegramRequest<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: toReplyMarkup(options?.inlineKeyboard)
  });
}

// Telegram REQUIRES answering a callback query to clear the client's loading spinner.
// Failures here are non-fatal to the underlying action, so callers wrap in try/catch.
export async function answerCallbackQuery(
  callbackQueryId: string,
  options?: { text?: string; showAlert?: boolean }
) {
  return telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: options?.text,
    show_alert: options?.showAlert ?? false
  });
}

// Strip (or replace) the inline keyboard on an existing message — used to disable a button
// after it has been tapped, so the same action cannot be triggered twice from one message.
export async function editTelegramReplyMarkup(
  chatId: string,
  messageId: number,
  keyboard?: InlineKeyboard
) {
  return telegramRequest("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: toReplyMarkup(keyboard) ?? { inline_keyboard: [] }
  });
}

export async function getTelegramFilePath(fileId: string) {
  const result = await telegramRequest<{ file_path: string }>("getFile", { file_id: fileId });
  return result.file_path;
}

export async function downloadTelegramFile(fileId: string) {
  const filePath = await getTelegramFilePath(fileId);
  const response = await fetch(`${telegramApiBase}/file/bot${getTelegramBotToken()}/${filePath}`);

  if (!response.ok) {
    throw new Error(`Telegram file download failed: ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const metadata = resolveTelegramImageMetadata({
    bytes,
    headerContentType: response.headers.get("content-type"),
    filePath
  });

  return {
    bytes,
    ...metadata
  };
}

export async function setTelegramWebhook(url: string, secretToken: string) {
  return telegramRequest("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"]
  });
}
