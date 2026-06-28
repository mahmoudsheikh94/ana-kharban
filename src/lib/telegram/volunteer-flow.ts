import type { ConversationState, NormalizedTelegramInput, TelegramConversation } from "./types";

// The volunteer fix-submission sub-flow. It is intentionally separate from the report
// intake FSM in `flow.ts`: a volunteer who has been told to `/submit <permitId>` walks
// through photo -> location -> optional description, producing a fix submission draft.

export type FixSubmissionDraft = {
  permitId: string;
  reportId: string;
  volunteerId: string;
  photoFileId?: string;
  latitude?: number;
  longitude?: number;
  description?: string | null;
};

export type VolunteerFlowResult = {
  state: ConversationState;
  reply: string;
  draft: FixSubmissionDraft;
  readyToSubmit: boolean;
  invalidAttempt?: boolean;
};

export function startFixSubmission(args: {
  permitId: string;
  reportId: string;
  volunteerId: string;
}): VolunteerFlowResult {
  return {
    state: "awaiting_fix_photo",
    reply: "أرسل صورة واضحة تثبت الإصلاح.",
    draft: {
      permitId: args.permitId,
      reportId: args.reportId,
      volunteerId: args.volunteerId
    },
    readyToSubmit: false
  };
}

const SKIP_VALUES = new Set(["/skip", "تخطي", "تخطى", "skip"]);

export function advanceFixSubmission(
  conversation: TelegramConversation,
  draft: FixSubmissionDraft,
  input: NormalizedTelegramInput
): VolunteerFlowResult {
  if (conversation.state === "awaiting_fix_photo") {
    if (input.kind !== "photo") {
      return {
        state: "awaiting_fix_photo",
        reply: "أرسل صورة الإصلاح كصورة من تيليجرام، وليس ملفاً أو نصاً.",
        draft,
        readyToSubmit: false,
        invalidAttempt: true
      };
    }

    return {
      state: "awaiting_fix_location",
      reply: "الصورة وصلت. أرسل موقع الإصلاح من زر مشاركة الموقع في تيليجرام.",
      draft: { ...draft, photoFileId: input.fileId },
      readyToSubmit: false
    };
  }

  if (conversation.state === "awaiting_fix_location") {
    if (input.kind !== "location") {
      return {
        state: "awaiting_fix_location",
        reply: "أرسل موقع GPS من تيليجرام حتى نربط الإصلاح بالمكان الصحيح.",
        draft,
        readyToSubmit: false,
        invalidAttempt: true
      };
    }

    return {
      state: "awaiting_fix_description",
      reply: "تم استلام الموقع. اكتب وصفاً قصيراً للإصلاح، أو أرسل /skip لإنهاء التقديم.",
      draft: { ...draft, latitude: input.latitude, longitude: input.longitude },
      readyToSubmit: false
    };
  }

  if (conversation.state === "awaiting_fix_description") {
    const description =
      input.kind === "text" && !SKIP_VALUES.has(input.text.trim().toLowerCase())
        ? input.text.trim()
        : null;

    return {
      state: "idle",
      reply: "تم استلام تقديم الإصلاح. سيراجعه المشرف ويعتمد النقاط عند الاكتمال. شكراً لتطوعك.",
      draft: { ...draft, description },
      readyToSubmit: true
    };
  }

  // Not in a volunteer state — caller should not have routed here.
  return {
    state: conversation.state,
    reply: "حدث خطأ في تدفق التقديم. أرسل /submit مع رقم التصريح من جديد.",
    draft,
    readyToSubmit: false,
    invalidAttempt: true
  };
}

// The public map links to https://t.me/<bot>?start=fix_<reportId>, which Telegram
// delivers to the bot as the text "/start fix_<reportId>". This extracts the report id
// from such a deep-link start payload, or returns null for an ordinary /start.
export function parseVolunteerStartPayload(text: string): string | null {
  const match = text.trim().match(/^\/start\s+fix_([0-9a-fA-F-]{36})$/);
  return match ? match[1] : null;
}

// Inline-button callback_data scheme. Kept short so payloads stay well under Telegram's
// 64-byte callback_data limit ("vol:" + a 36-char UUID = 40 bytes). Buttons replace the
// slash-command + paste-the-UUID UX entirely.
export type CallbackAction =
  | { type: "volunteer"; reportId: string } // confirm volunteering for a report
  | { type: "submit"; permitId: string } // begin fix submission for a permit
  | { type: "skip" } // skip the optional fix description
  | { type: "cancel" } // cancel the current volunteer/fix flow
  | { type: "mypermits" }; // list the user's permits

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

export function buildCallbackData(action: CallbackAction): string {
  switch (action.type) {
    case "volunteer":
      return `vol:${action.reportId}`;
    case "submit":
      return `sub:${action.permitId}`;
    case "skip":
      return "skip";
    case "cancel":
      return "can";
    case "mypermits":
      return "mine";
  }
}

export function parseCallback(data: string): CallbackAction | null {
  const trimmed = data.trim();
  if (trimmed === "skip") {
    return { type: "skip" };
  }
  if (trimmed === "can") {
    return { type: "cancel" };
  }
  if (trimmed === "mine") {
    return { type: "mypermits" };
  }
  if (trimmed.startsWith("vol:")) {
    const reportId = trimmed.slice(4);
    return UUID_RE.test(reportId) ? { type: "volunteer", reportId } : null;
  }
  if (trimmed.startsWith("sub:")) {
    const permitId = trimmed.slice(4);
    return UUID_RE.test(permitId) ? { type: "submit", permitId } : null;
  }
  return null;
}

export function isFixSubmissionState(state: ConversationState): boolean {
  return (
    state === "awaiting_fix_photo" ||
    state === "awaiting_fix_location" ||
    state === "awaiting_fix_description"
  );
}

export function isCompleteFixDraft(draft: FixSubmissionDraft): boolean {
  return Boolean(
    draft.permitId &&
      draft.reportId &&
      draft.volunteerId &&
      draft.photoFileId &&
      typeof draft.latitude === "number" &&
      typeof draft.longitude === "number"
  );
}
