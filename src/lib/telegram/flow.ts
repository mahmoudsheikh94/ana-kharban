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

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function isAffirmative(value: string) {
  return ["نعم", "اه", "آه", "ايوه", "أيوه", "yes", "y", "ok", "تمام", "/confirm"].includes(normalizeText(value));
}

function isNegative(value: string) {
  return ["لا", "no", "n", "غلط", "خطأ", "مش صحيح", "/wrong"].includes(normalizeText(value));
}

export function buildNextStep(
  currentConversation: TelegramConversation | null,
  input: NormalizedTelegramInput
): FlowResult {
  if (input.kind === "text" && ["/start", "ابدأ", "start"].includes(normalizeText(input.text))) {
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
          state: "awaiting_ai_confirmation",
          draft: {
            ...conversation.draft,
            latitude: input.latitude,
            longitude: input.longitude
          }
        },
        input.messageId
      ),
      reply: "تم استلام الموقع. سأحلل الصورة الآن وأرسل لك النتيجة للتأكيد.",
      readyToSubmit: true,
      action: "create_and_analyze"
    };
  }

  if (conversation.state === "awaiting_ai_confirmation") {
    if (input.kind !== "text") {
      return {
        conversation: withMessage(conversation, input.messageId),
        reply: "هل التحليل صحيح؟ أرسل نعم للتأكيد أو لا لإضافة وصف قصير.",
        readyToSubmit: false
      };
    }

    if (isAffirmative(input.text)) {
      return {
        conversation: withMessage(
          {
            ...conversation,
            state: "idle"
          },
          input.messageId
        ),
        reply: "تم تأكيد التحليل. شكراً لك.",
        readyToSubmit: true,
        action: "confirm_ai"
      };
    }

    if (isNegative(input.text)) {
      return {
        conversation: withMessage(
          {
            ...conversation,
            state: "awaiting_correction_description"
          },
          input.messageId
        ),
        reply: "اكتب وصفاً قصيراً للمشكلة، وسأعيد تحليل البلاغ بناءً عليه.",
        readyToSubmit: false
      };
    }

    return {
      conversation: withMessage(conversation, input.messageId),
      reply: "لم أفهم الرد. أرسل نعم إذا كان التحليل صحيحاً، أو لا لإضافة وصف.",
      readyToSubmit: false
    };
  }

  if (conversation.state === "awaiting_correction_description") {
    if (input.kind !== "text" || input.text.trim().length < 4) {
      return {
        conversation: withMessage(conversation, input.messageId),
        reply: "اكتب وصفاً أوضح للمشكلة في رسالة نصية قصيرة.",
        readyToSubmit: false
      };
    }

    return {
      conversation: withMessage(
        {
          ...conversation,
          state: "idle",
          draft: { ...conversation.draft, userDescription: input.text.trim() }
        },
        input.messageId
      ),
      reply: "تم استلام الوصف. سأعيد تحليل البلاغ وأرسل لك رقم التتبع.",
      readyToSubmit: true,
      action: "reanalyze_with_description"
    };
  }

  if (conversation.state === "awaiting_description") {
    const description =
      input.kind === "text" && normalizeText(input.text) !== "/skip" ? input.text.trim() : null;

    return {
      conversation: withMessage(
        {
          ...conversation,
          state: "awaiting_ai_confirmation",
          draft: { ...conversation.draft, userDescription: description }
        },
        input.messageId
      ),
      reply: "تم استلام البلاغ. سنحلل الصورة ونرسل رقم التتبع بعد قليل.",
      readyToSubmit: true,
      action: "create_and_analyze"
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
