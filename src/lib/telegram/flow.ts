import type { FlowResult, NormalizedTelegramInput, TelegramConversation } from "./types";

const startReply =
  "أهلاً بك في أنا خربان. سنسجل بلاغك خلال دقيقة. أرسل الاسم الكامل كما تريد ظهوره في البلاغ.";

export function createInitialConversation(telegramUserId: string, chatId: string): TelegramConversation {
  return {
    telegramUserId,
    chatId,
    state: "awaiting_full_name",
    draft: {}
  };
}

function withMessage(conversation: TelegramConversation, messageId: number): TelegramConversation {
  return {
    ...conversation,
    lastMessageId: messageId
  };
}

function isPhoneNumber(value: string) {
  return /^\+?[0-9\s-]{8,18}$/.test(value.trim());
}

export function buildNextStep(
  currentConversation: TelegramConversation | null,
  input: NormalizedTelegramInput
): FlowResult {
  if (input.kind === "text" && ["/start", "ابدأ", "start"].includes(input.text.trim().toLowerCase())) {
    return {
      conversation: withMessage(createInitialConversation(input.telegramUserId, input.chatId), input.messageId),
      reply: startReply,
      readyToSubmit: false
    };
  }

  const conversation =
    currentConversation ?? createInitialConversation(input.telegramUserId, input.chatId);

  if (conversation.state === "awaiting_full_name") {
    if (input.kind !== "text" || input.text.trim().length < 4) {
      return {
        conversation: withMessage(conversation, input.messageId),
        reply: "أرسل الاسم الكامل نصاً، مثال: ليان أبو زيد.",
        readyToSubmit: false
      };
    }

    return {
      conversation: withMessage(
        {
          ...conversation,
          state: "awaiting_phone",
          draft: { ...conversation.draft, fullName: input.text.trim() }
        },
        input.messageId
      ),
      reply: "تمام. أرسل رقم الهاتف بصيغة صحيحة، مثال: +962790000000.",
      readyToSubmit: false
    };
  }

  if (conversation.state === "awaiting_phone") {
    const phoneNumber = input.kind === "contact" ? input.phoneNumber : input.kind === "text" ? input.text : "";

    if (!isPhoneNumber(phoneNumber)) {
      return {
        conversation: withMessage(conversation, input.messageId),
        reply: "أرسل رقم هاتف صحيح، مثال: +962790000000.",
        readyToSubmit: false
      };
    }

    return {
      conversation: withMessage(
        {
          ...conversation,
          state: "awaiting_photo",
          draft: { ...conversation.draft, phoneNumber: phoneNumber.trim() }
        },
        input.messageId
      ),
      reply: "وصل الرقم. أرسل صورة واضحة للمشكلة العامة.",
      readyToSubmit: false
    };
  }

  if (conversation.state === "awaiting_photo") {
    if (input.kind !== "photo") {
      return {
        conversation: withMessage(conversation, input.messageId),
        reply: "أرسل صورة البلاغ كصورة من تيليجرام، وليس ملفاً أو نصاً.",
        readyToSubmit: false
      };
    }

    return {
      conversation: withMessage(
        {
          ...conversation,
          state: "awaiting_location",
          draft: { ...conversation.draft, photoFileId: input.fileId }
        },
        input.messageId
      ),
      reply: "الصورة وصلت. أرسل الموقع من زر مشاركة الموقع في تيليجرام.",
      readyToSubmit: false
    };
  }

  if (conversation.state === "awaiting_location") {
    if (input.kind !== "location") {
      return {
        conversation: withMessage(conversation, input.messageId),
        reply: "أرسل موقع GPS من تيليجرام حتى نربط البلاغ بالمكان الصحيح.",
        readyToSubmit: false
      };
    }

    return {
      conversation: withMessage(
        {
          ...conversation,
          state: "awaiting_description",
          draft: {
            ...conversation.draft,
            latitude: input.latitude,
            longitude: input.longitude
          }
        },
        input.messageId
      ),
      reply: "اختياري: اكتب وصفاً قصيراً للمشكلة، أو أرسل /skip لتخطي الوصف.",
      readyToSubmit: false
    };
  }

  if (conversation.state === "awaiting_description") {
    const description =
      input.kind === "text" && input.text.trim().toLowerCase() !== "/skip" ? input.text.trim() : null;

    return {
      conversation: withMessage(
        {
          ...conversation,
          state: "idle",
          draft: { ...conversation.draft, userDescription: description }
        },
        input.messageId
      ),
      reply: "تم استلام البلاغ. سنحلل الصورة ونرسل رقم التتبع بعد قليل.",
      readyToSubmit: true
    };
  }

  return {
    conversation: withMessage(createInitialConversation(input.telegramUserId, input.chatId), input.messageId),
    reply: startReply,
    readyToSubmit: false
  };
}

export function isCompleteDraft(draft: TelegramConversation["draft"]) {
  return Boolean(
    draft.fullName &&
      draft.phoneNumber &&
      draft.photoFileId &&
      typeof draft.latitude === "number" &&
      typeof draft.longitude === "number"
  );
}
