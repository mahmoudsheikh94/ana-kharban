import "server-only";

import { getTelegramBotToken } from "@/lib/supabase/config";

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

export async function sendTelegramMessage(chatId: string, text: string) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
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

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "image/jpeg",
    extension: filePath.split(".").pop() ?? "jpg"
  };
}

export async function setTelegramWebhook(url: string, secretToken: string) {
  return telegramRequest("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message"]
  });
}
