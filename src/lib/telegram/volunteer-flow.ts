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
