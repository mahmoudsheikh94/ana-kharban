import type { NormalizedTelegramInput } from "./types";

type TelegramPhotoSize = {
  file_id: string;
  width?: number;
  height?: number;
  file_size?: number;
};

type TelegramMessage = {
  message_id: number;
  from?: { id: number | string };
  chat: { id: number | string };
  text?: string;
  photo?: TelegramPhotoSize[];
  location?: { latitude: number; longitude: number };
  contact?: { phone_number: string };
};

type TelegramCallbackQuery = {
  id: string;
  from?: { id: number | string };
  message?: { message_id: number; chat: { id: number | string } };
  data?: string;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

function base(message: TelegramMessage, updateId?: number) {
  return {
    chatId: String(message.chat.id),
    telegramUserId: String(message.from?.id ?? message.chat.id),
    messageId: message.message_id,
    updateId
  };
}

export function normalizeTelegramUpdate(update: TelegramUpdate): NormalizedTelegramInput | null {
  const updateId = update.update_id;

  // Inline-keyboard button press. Carries its own message + chat + user.
  const callback = update.callback_query;
  if (callback?.message && callback.data) {
    return {
      kind: "callback",
      data: callback.data,
      callbackQueryId: callback.id,
      chatId: String(callback.message.chat.id),
      telegramUserId: String(callback.from?.id ?? callback.message.chat.id),
      messageId: callback.message.message_id,
      updateId
    };
  }

  const message = update.message;

  if (!message) {
    return null;
  }

  if (message.text) {
    return {
      kind: "text",
      text: message.text,
      ...base(message, updateId)
    };
  }

  if (message.contact?.phone_number) {
    return {
      kind: "contact",
      phoneNumber: message.contact.phone_number,
      ...base(message, updateId)
    };
  }

  if (message.photo?.length) {
    const photo = [...message.photo].sort((left, right) => {
      const leftScore = left.file_size ?? (left.width ?? 0) * (left.height ?? 0);
      const rightScore = right.file_size ?? (right.width ?? 0) * (right.height ?? 0);
      return rightScore - leftScore;
    })[0];

    return {
      kind: "photo",
      fileId: photo.file_id,
      ...base(message, updateId)
    };
  }

  if (message.location) {
    return {
      kind: "location",
      latitude: message.location.latitude,
      longitude: message.location.longitude,
      ...base(message, updateId)
    };
  }

  return {
    kind: "unsupported",
    ...base(message)
  };
}
