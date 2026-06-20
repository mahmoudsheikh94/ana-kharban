export type ConversationState =
  | "idle"
  | "awaiting_full_name"
  | "awaiting_phone"
  | "awaiting_photo"
  | "awaiting_location"
  | "awaiting_description"
  | "awaiting_ai_confirmation"
  | "awaiting_correction_description";

export type TelegramDraft = {
  fullName?: string;
  phoneNumber?: string;
  photoFileId?: string;
  latitude?: number;
  longitude?: number;
  userDescription?: string | null;
  reportId?: string;
  invalidAttempts?: number;
};

export type TelegramConversation = {
  telegramUserId: string;
  chatId: string;
  state: ConversationState;
  draft: TelegramDraft;
  lastMessageId?: number;
};

export type NormalizedTelegramInput =
  | {
      kind: "text";
      text: string;
      chatId: string;
      telegramUserId: string;
      messageId: number;
    }
  | {
      kind: "photo";
      fileId: string;
      chatId: string;
      telegramUserId: string;
      messageId: number;
    }
  | {
      kind: "location";
      latitude: number;
      longitude: number;
      chatId: string;
      telegramUserId: string;
      messageId: number;
    }
  | {
      kind: "contact";
      phoneNumber: string;
      chatId: string;
      telegramUserId: string;
      messageId: number;
    }
  | {
      kind: "unsupported";
      chatId: string;
      telegramUserId: string;
      messageId: number;
    };

export type FlowResult = {
  conversation: TelegramConversation;
  reply: string;
  readyToSubmit: boolean;
  action?: "create_and_analyze" | "confirm_ai" | "reanalyze_with_description";
  invalidAttempt?: boolean;
};
