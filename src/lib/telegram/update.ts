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

type TelegramUpdate = {
  message?: TelegramMessage;
};

function base(message: TelegramMessage) {
  return {
    chatId: String(message.chat.id),
    telegramUserId: String(message.from?.id ?? message.chat.id),
    messageId: message.message_id
  };
}

export function normalizeTelegramUpdate(update: TelegramUpdate): NormalizedTelegramInput | null {
  const message = update.message;

  if (!message) {
    return null;
  }

  if (message.text) {
    return {
      kind: "text",
      text: message.text,
      ...base(message)
    };
  }

  if (message.contact?.phone_number) {
    return {
      kind: "contact",
      phoneNumber: message.contact.phone_number,
      ...base(message)
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
      ...base(message)
    };
  }

  if (message.location) {
    return {
      kind: "location",
      latitude: message.location.latitude,
      longitude: message.location.longitude,
      ...base(message)
    };
  }

  return {
    kind: "unsupported",
    ...base(message)
  };
}
