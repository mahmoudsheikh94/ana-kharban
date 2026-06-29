import { evaluateSubmissionGuard, recordInvalidAttempt, type SubmissionGuardReason } from "@/lib/abuse/policy";
import { analyzeReportWithGemini } from "@/lib/ai/gemini";
import { inferJordanArea } from "@/lib/geo/jordan";
import {
  addReportStatusHistory,
  attachTelegramReportToConversation,
  claimTelegramUpdate,
  clearTelegramConversation,
  createTelegramReport,
  enforceTelegramRateLimit,
  getTelegramAbuseGuardContext,
  getCitizenReportStatus,
  getTelegramConversation,
  markReportForManualAiReview,
  recordAiUsageEvent,
  recordTelegramAbuseEvent,
  updateReportCitizenDescription,
  updateReportWithAiAnalysis,
  uploadFixImage,
  uploadReportImage,
  upsertTelegramConversation
} from "@/lib/supabase/ingestion";
import {
  checkFixProximity,
  createFixSubmission,
  getPermitForSubmission,
  getReporterByTelegramId,
  getSoleActivePermitForTelegramUser,
  getVolunteerPermitsByTelegramId,
  requestPermit,
  setVolunteerDisplayName,
  upsertVolunteer,
  type RequestPermitResult
} from "@/lib/supabase/permits";
import { detectAndFlagDuplicate } from "@/lib/supabase/reports";
import { permitStatusMeta } from "@/lib/permits/types";
import {
  advanceFixSubmission,
  buildCallbackData,
  isCompleteFixDraft,
  isFixSubmissionState,
  parseCallback,
  parseVolunteerStartPayload,
  startFixSubmission,
  type FixSubmissionDraft
} from "@/lib/telegram/volunteer-flow";
import { getAbuseLimits, getTelegramWebhookSecret } from "@/lib/supabase/config";
import {
  answerCallbackQuery,
  downloadTelegramFile,
  editTelegramReplyMarkup,
  sendTelegramMessage,
  type InlineKeyboard
} from "@/lib/telegram/api";
import { buildNextStep, createInitialConversation, isCompleteDraft, isPhoneNumber } from "@/lib/telegram/flow";
import { normalizeTelegramUpdate } from "@/lib/telegram/update";
import type { NormalizedTelegramInput, TelegramConversation } from "@/lib/telegram/types";
import { formatDateAr, publicStatusMeta, severityMeta, validationStatusMeta } from "@/lib/reports/format";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CompleteTelegramDraft = {
  fullName: string;
  phoneNumber: string;
  photoFileId: string;
  latitude: number;
  longitude: number;
  userDescription?: string | null;
  reportId?: string;
};

const guardReasonMessages: Record<SubmissionGuardReason, string> = {
  blocked_user: "لا يمكن استقبال بلاغات من هذا الحساب حالياً.",
  outside_jordan: "هذه المنصة مخصصة للبلاغات داخل الأردن فقط. تأكد من الموقع وأعد المحاولة.",
  duplicate_file: "يبدو أن هذه الصورة أُرسلت سابقاً. لن ننشئ بلاغاً مكرراً.",
  duplicate_nearby_report: "يوجد بلاغ قريب جداً من نفس الحساب خلال آخر 24 ساعة. لن ننشئ بلاغاً مكرراً.",
  user_weekly_report_limit: "وصلت للحد الأسبوعي للبلاغات. جرّب لاحقاً إذا ظهرت مشكلة جديدة.",
  user_daily_ai_limit: "وصلت للحد اليومي للتحليل الآلي. سنحفظ البلاغ للمراجعة اليدوية بدون استخدام AI.",
  global_daily_ai_limit: "وصلت المنصة للحد اليومي للتحليل الآلي. سنحفظ البلاغ للمراجعة اليدوية بدون استخدام AI.",
  reanalysis_limit: "يمكن تعديل تحليل البلاغ مرة واحدة فقط. سيبقى البلاغ للمراجعة اليدوية إذا لزم."
};

function toCompleteDraft(draft: ReturnType<typeof buildNextStep>["conversation"]["draft"]): CompleteTelegramDraft | null {
  if (!isCompleteDraft(draft)) {
    return null;
  }

  return {
    fullName: draft.fullName!,
    phoneNumber: draft.phoneNumber!,
    photoFileId: draft.photoFileId!,
    latitude: draft.latitude!,
    longitude: draft.longitude!,
    userDescription: draft.userDescription,
    reportId: draft.reportId
  };
}

function formatAiAnalysisMessage({
  reportId,
  analysis,
  askForConfirmation
}: {
  reportId: string;
  analysis: Awaited<ReturnType<typeof analyzeReportWithGemini>>;
  askForConfirmation: boolean;
}) {
  const lines = [
    "حللت البلاغ كالتالي:",
    `رقم التتبع: <code>${reportId}</code>`,
    `التصنيف: ${analysis.category}`,
    `الخطورة: ${severityMeta[analysis.severity]?.label ?? analysis.severity}`,
    `النتيجة: ${validationStatusMeta[analysis.validationStatus]?.label ?? analysis.validationStatus}`,
    `الثقة: ${Math.round(analysis.confidence * 100)}%`
  ];

  if (askForConfirmation) {
    lines.push("", "هل التحليل صحيح؟ أرسل نعم للتأكيد، أو لا لإضافة وصف قصير.");
  }

  return lines.join("\n");
}

async function createAndAnalyzeReport({
  telegramUserId,
  chatId,
  messageId,
  draft,
  maxImageBytes
}: {
  telegramUserId: string;
  chatId: string;
  messageId?: number;
  draft: CompleteTelegramDraft;
  maxImageBytes: number;
}) {
  const image = await downloadTelegramFile(draft.photoFileId);
  if (image.bytes.byteLength > maxImageBytes) {
    throw new Error(`Telegram image exceeds maximum size: ${image.bytes.byteLength}`);
  }

  const imageUrl = await uploadReportImage({
    telegramUserId,
    bytes: image.bytes,
    contentType: image.contentType,
    extension: image.extension
  });

  const reportId = await createTelegramReport({
    telegramUserId,
    chatId,
    messageId,
    photoFileId: draft.photoFileId,
    imageUrl,
    draft
  });

  const place = inferJordanArea(draft.latitude, draft.longitude);
  const analysis = await analyzeReportWithGemini({
    imageBytes: image.bytes,
    mimeType: image.contentType,
    city: place.city,
    area: place.area,
    latitude: draft.latitude,
    longitude: draft.longitude,
    userDescription: draft.userDescription ?? null
  });
  await recordAiUsageEvent({ telegramUserId, reportId, purpose: "initial_analysis" });
  await updateReportWithAiAnalysis(reportId, analysis);

  // Cross-user duplicate detection: flag (don't reject) if a nearby same-category report
  // already exists. Best-effort — never block report creation on a detection failure.
  try {
    await detectAndFlagDuplicate({
      reportId,
      latitude: draft.latitude,
      longitude: draft.longitude,
      aiCategory: analysis.category
    });
  } catch (error) {
    console.error("Duplicate detection failed", error);
  }

  await attachTelegramReportToConversation({ telegramUserId, reportId });

  return { reportId, analysis };
}

async function createManualReviewReport({
  telegramUserId,
  chatId,
  messageId,
  draft,
  maxImageBytes,
  reason
}: {
  telegramUserId: string;
  chatId: string;
  messageId?: number;
  draft: CompleteTelegramDraft;
  maxImageBytes: number;
  reason: string;
}) {
  const image = await downloadTelegramFile(draft.photoFileId);
  if (image.bytes.byteLength > maxImageBytes) {
    throw new Error(`Telegram image exceeds maximum size: ${image.bytes.byteLength}`);
  }

  const imageUrl = await uploadReportImage({
    telegramUserId,
    bytes: image.bytes,
    contentType: image.contentType,
    extension: image.extension
  });

  const reportId = await createTelegramReport({
    telegramUserId,
    chatId,
    messageId,
    photoFileId: draft.photoFileId,
    imageUrl,
    draft
  });

  await markReportForManualAiReview({ reportId, reason });
  await clearTelegramConversation(telegramUserId);

  return reportId;
}

async function reanalyzeReportWithDescription({
  reportId,
  telegramUserId,
  draft,
  userDescription
}: {
  reportId: string;
  telegramUserId: string;
  draft: CompleteTelegramDraft;
  userDescription: string;
}) {
  await updateReportCitizenDescription({ reportId, userDescription });
  const image = await downloadTelegramFile(draft.photoFileId);
  const place = inferJordanArea(draft.latitude, draft.longitude);
  const analysis = await analyzeReportWithGemini({
    imageBytes: image.bytes,
    mimeType: image.contentType,
    city: place.city,
    area: place.area,
    latitude: draft.latitude,
    longitude: draft.longitude,
    userDescription
  });

  await recordAiUsageEvent({ telegramUserId, reportId, purpose: "reanalyze_with_description" });
  await updateReportWithAiAnalysis(reportId, analysis);
  await clearTelegramConversation(telegramUserId);

  return analysis;
}

// A placeholder display name we use only until a volunteer gives a real one. It is never
// shown publicly (the public layer renders "متطوع مجهول" for it instead of the raw ID).
function volunteerPlaceholderName(telegramUserId: string) {
  return `متطوع ${telegramUserId}`;
}

async function resolveVolunteerForUser(telegramUserId: string) {
  // A returning Telegram user is never re-asked for identity: we seed display_name/phone
  // from their existing reporter record (the common case, since volunteers discover reports
  // as reporters) and otherwise fall back to a placeholder. upsert dedupes per id.
  const reporter = await getReporterByTelegramId(telegramUserId);
  const hasRealName = Boolean(reporter?.full_name?.trim());
  const volunteer = await upsertVolunteer({
    telegramUserId,
    displayName: reporter?.full_name?.trim() || volunteerPlaceholderName(telegramUserId),
    phoneNumber: reporter?.phone_number ?? null
  });
  // A volunteer needs a real name if neither the reporter record nor a prior prompt gave one.
  const needsName = !hasRealName && volunteer.display_name === volunteerPlaceholderName(telegramUserId);
  return { volunteer, needsName };
}

const volunteerGuardMessages: Record<Extract<RequestPermitResult, { ok: false }>["reason"], string> = {
  report_not_found: "لم أجد هذا البلاغ. قد يكون حُذف أو تغيّر رابطه.",
  report_not_approved: "هذا البلاغ غير معتمد بعد، لا يمكن التطوع لإصلاحه الآن.",
  report_has_live_permit: "يوجد متطوع يعمل على هذا البلاغ بالفعل. شكراً لاهتمامك — اختر بلاغاً آخر.",
  report_already_fixed: "هذا البلاغ تم إصلاحه بالفعل. شكراً لك! تصفّح بلاغات أخرى بحاجة لمتطوعين."
};

// Core volunteer action, shared by the deep-link tap and the inline confirm button: create a
// pending permit for `reportId` and reply WITHOUT exposing any UUID. After admin approval the
// volunteer is pushed a button to submit the fix — they never type a command or an id.
async function requestVolunteerPermit(args: {
  chatId: string;
  telegramUserId: string;
}, reportId: string) {
  try {
    const { volunteer, needsName } = await resolveVolunteerForUser(args.telegramUserId);

    // First-time volunteer with no name on file: ask for one before creating the permit, so
    // the leaderboard shows a real name instead of a Telegram ID. We stash the report id in
    // the conversation draft and resume in handleVolunteerNameStep once they reply.
    if (needsName) {
      await upsertTelegramConversation({
        telegramUserId: args.telegramUserId,
        chatId: args.chatId,
        state: "awaiting_volunteer_name",
        draft: { pendingVolunteerReportId: reportId }
      });
      await sendTelegramMessage(
        args.chatId,
        "قبل أن نسجّل تطوعك، ما الاسم الذي تريد ظهوره في لوحة شرف المتطوعين؟ أرسله في رسالة واحدة."
      );
      return;
    }

    const result = await requestPermit({ reportId, volunteerId: volunteer.id });

    if (!result.ok) {
      await sendTelegramMessage(args.chatId, volunteerGuardMessages[result.reason]);
      return;
    }

    await sendTelegramMessage(
      args.chatId,
      [
        "✅ تم تسجيل طلب تطوعك لإصلاح هذا البلاغ.",
        "طلبك الآن قيد مراجعة المشرف. سنرسل لك زر إرسال صور الإصلاح فور الموافقة.",
        "",
        "لمتابعة كل طلباتك اضغط زر «حالة بلاغاتي» في أي وقت."
      ].join("\n"),
      { inlineKeyboard: myPermitsKeyboard() }
    );
  } catch (error) {
    console.error(error);
    await sendTelegramMessage(args.chatId, "تعذر تسجيل طلب التطوع الآن. حاول لاحقاً.");
  }
}

// Resume after asking an unnamed volunteer for their display name: store the name, then
// create the pending permit for the report they were trying to volunteer for.
async function handleVolunteerNameStep(
  conversation: Awaited<ReturnType<typeof getTelegramConversation>>,
  input: Extract<NormalizedTelegramInput, { kind: "text" }>
) {
  const reportId = conversation?.draft.pendingVolunteerReportId;

  if (!conversation || !reportId) {
    await clearTelegramConversation(input.telegramUserId);
    await sendTelegramMessage(input.chatId, "انتهت الجلسة. تصفّح الخريطة العامة واختر بلاغاً لإصلاحه من جديد.");
    return;
  }

  const name = input.text.trim();
  if (name.length < 2 || name.length > 60) {
    await sendTelegramMessage(input.chatId, "أرسل اسماً صحيحاً (بين حرفين و60 حرفاً) ليظهر في لوحة الشرف.");
    return;
  }

  try {
    const { volunteer } = await resolveVolunteerForUser(input.telegramUserId);
    await setVolunteerDisplayName(input.telegramUserId, name);
    await clearTelegramConversation(input.telegramUserId);

    const result = await requestPermit({ reportId, volunteerId: volunteer.id });
    if (!result.ok) {
      await sendTelegramMessage(input.chatId, volunteerGuardMessages[result.reason]);
      return;
    }

    await sendTelegramMessage(
      input.chatId,
      [
        `شكراً ${name}! ✅ تم تسجيل طلب تطوعك لإصلاح هذا البلاغ.`,
        "طلبك الآن قيد مراجعة المشرف. سنرسل لك زر إرسال صور الإصلاح فور الموافقة.",
        "",
        "لمتابعة كل طلباتك اضغط زر «حالة بلاغاتي» في أي وقت."
      ].join("\n"),
      { inlineKeyboard: myPermitsKeyboard() }
    );
  } catch (error) {
    console.error(error);
    await clearTelegramConversation(input.telegramUserId);
    await sendTelegramMessage(input.chatId, "تعذر تسجيل طلب التطوع الآن. حاول لاحقاً.");
  }
}

// Begin the fix-submission sub-flow for an approved/active permit (from the Submit button or
// a /submit fallback). Sets the conversation into the photo->location->description states.
async function beginFixSubmission(args: {
  chatId: string;
  telegramUserId: string;
  messageId: number;
  permitId: string;
}) {
  const permit = await getPermitForSubmission(args.permitId);

  if (!permit) {
    await sendTelegramMessage(args.chatId, "لم أجد هذا التصريح. اضغط «حالة بلاغاتي» لعرض تصاريحك.", {
      inlineKeyboard: myPermitsKeyboard()
    });
    return;
  }

  if (permit.status !== "approved" && permit.status !== "active") {
    await sendTelegramMessage(
      args.chatId,
      "لا يمكن إرسال صور الإصلاح الآن. ننتظر موافقة المشرف على هذا التصريح.",
      { inlineKeyboard: myPermitsKeyboard() }
    );
    return;
  }

  const { volunteer } = await resolveVolunteerForUser(args.telegramUserId);
  const started = startFixSubmission({
    permitId: permit.id,
    reportId: permit.report_id,
    volunteerId: volunteer.id
  });

  await upsertTelegramConversation({
    telegramUserId: args.telegramUserId,
    chatId: args.chatId,
    state: started.state,
    draft: { fix: started.draft },
    lastMessageId: args.messageId
  });
  await sendTelegramMessage(args.chatId, started.reply);
}

// "My permits" — replaces the missing /myfixes. Lists the user's permits with status, and an
// inline Submit button for any active permit, so a lost permit is always recoverable.
async function sendMyPermits(args: { chatId: string; telegramUserId: string }) {
  const permits = await getVolunteerPermitsByTelegramId(args.telegramUserId);

  if (permits.length === 0) {
    await sendTelegramMessage(
      args.chatId,
      "ليس لديك أي طلبات تطوع بعد. تصفّح الخريطة العامة واختر بلاغاً لإصلاحه."
    );
    return;
  }

  const lines = permits.map((permit) => {
    const where = permit.city ? ` – ${permit.city}` : "";
    const what = permit.reportCategory ?? "بلاغ";
    return `• ${what}${where}: ${permitStatusMeta[permit.status].label}`;
  });

  // One Submit button per active permit (label disambiguated by category).
  const active = permits.filter((permit) => permit.status === "active");
  const keyboard: InlineKeyboard = active.map((permit) => [
    {
      text: `📸 أرسل صور إصلاح: ${permit.reportCategory ?? "بلاغ"}`,
      callbackData: buildCallbackData({ type: "submit", permitId: permit.id })
    }
  ]);

  await sendTelegramMessage(args.chatId, ["طلبات تطوعك:", ...lines].join("\n"), {
    inlineKeyboard: keyboard.length > 0 ? keyboard : undefined
  });
}

function myPermitsKeyboard(): InlineKeyboard {
  return [[{ text: "📋 حالة بلاغاتي", callbackData: buildCallbackData({ type: "mypermits" }) }]];
}

// Handle an inline-button press. Always answers the callback query (clears the spinner) and,
// where useful, strips the tapped message's buttons so the same action can't be re-fired.
async function handleCallback(input: Extract<NormalizedTelegramInput, { kind: "callback" }>) {
  const action = parseCallback(input.data);

  // Always acknowledge, even on unknown data.
  try {
    await answerCallbackQuery(input.callbackQueryId);
  } catch (error) {
    console.error("answerCallbackQuery failed", error);
  }

  if (!action) {
    return;
  }

  try {
    if (action.type === "volunteer") {
      await stripButtons(input);
      await requestVolunteerPermit({ chatId: input.chatId, telegramUserId: input.telegramUserId }, action.reportId);
      return;
    }

    if (action.type === "submit") {
      await stripButtons(input);
      await beginFixSubmission({
        chatId: input.chatId,
        telegramUserId: input.telegramUserId,
        messageId: input.messageId,
        permitId: action.permitId
      });
      return;
    }

    if (action.type === "mypermits") {
      await sendMyPermits({ chatId: input.chatId, telegramUserId: input.telegramUserId });
      return;
    }

    if (action.type === "cancel") {
      await clearTelegramConversation(input.telegramUserId);
      await stripButtons(input);
      await sendTelegramMessage(input.chatId, "تم الإلغاء. يمكنك البدء من جديد من الخريطة العامة.");
      return;
    }

    if (action.type === "confirm_identity") {
      // Returning reporter confirmed their stored name/phone — skip straight to the photo
      // step with the identity draft intact. Guard on state so a stale button can't advance
      // an unrelated conversation.
      const conversation = await getTelegramConversation(input.telegramUserId);
      if (conversation && conversation.state === "awaiting_identity_confirmation") {
        await stripButtons(input);
        await upsertTelegramConversation({ ...conversation, state: "awaiting_photo" });
        await sendTelegramMessage(input.chatId, "وصل الرقم. أرسل صورة واضحة للمشكلة العامة.");
      }
      return;
    }

    if (action.type === "edit_identity") {
      // Returning reporter wants to update their details — reset to the first-time flow.
      await stripButtons(input);
      await upsertTelegramConversation(createInitialConversation(input.telegramUserId, input.chatId));
      await sendTelegramMessage(
        input.chatId,
        "تمام. أرسل الاسم الكامل كما تريد ظهوره في البلاغ."
      );
      return;
    }

    if (action.type === "skip") {
      // Treated as the description-skip during fix submission; routed via the conversation.
      const conversation = await getTelegramConversation(input.telegramUserId);
      if (conversation && conversation.state === "awaiting_fix_description") {
        await stripButtons(input);
        await handleFixSubmissionStep(conversation, {
          kind: "text",
          text: "/skip",
          chatId: input.chatId,
          telegramUserId: input.telegramUserId,
          messageId: input.messageId,
          updateId: input.updateId
        });
      }
      return;
    }
  } catch (error) {
    console.error(error);
    await sendTelegramMessage(input.chatId, "تعذر تنفيذ الإجراء الآن. حاول لاحقاً.");
  }
}

// Best-effort removal of the inline keyboard from the message a button was tapped on.
async function stripButtons(input: Extract<NormalizedTelegramInput, { kind: "callback" }>) {
  try {
    await editTelegramReplyMarkup(input.chatId, input.messageId);
  } catch (error) {
    console.error("editTelegramReplyMarkup failed", error);
  }
}

function identityConfirmKeyboard(): InlineKeyboard {
  return [
    [{ text: "متابعة ✓", callbackData: buildCallbackData({ type: "confirm_identity" }) }],
    [{ text: "تعديل بياناتي", callbackData: buildCallbackData({ type: "edit_identity" }) }]
  ];
}

// Seed a returning reporter's conversation from their stored record so they skip the
// name + phone steps. Returns null for a brand-new user, or a record whose name/phone is
// missing or fails validation — those fall through to the normal first-time flow. The
// reporter columns are nullable in the DB even though the type claims non-null, so we guard
// at runtime. The seeded draft carries ONLY fullName/phoneNumber (no photo/location), so the
// completeness check can't fire until the user actually sends a photo and location.
async function seedReturningReporter(
  input: Extract<NormalizedTelegramInput, { kind: "text" }>
): Promise<TelegramConversation | null> {
  const reporter = await getReporterByTelegramId(input.telegramUserId);
  const fullName = reporter?.full_name?.trim();
  const phoneNumber = reporter?.phone_number?.trim();

  if (!fullName || !phoneNumber || !isPhoneNumber(phoneNumber)) {
    return null;
  }

  return {
    telegramUserId: input.telegramUserId,
    chatId: input.chatId,
    state: "awaiting_identity_confirmation",
    draft: { fullName, phoneNumber },
    lastMessageId: input.messageId
  };
}

// /fix <reportId> text fallback (deep link routes through here too). Buttons are preferred.
async function handleVolunteerFixCommand(input: Extract<NormalizedTelegramInput, { kind: "text" }>) {
  const reportId = input.text.trim().split(/\s+/)[1];

  if (!reportId) {
    await sendTelegramMessage(
      input.chatId,
      "افتح الخريطة العامة واضغط «تطوّع لإصلاح هذا البلاغ» على أي بلاغ للبدء."
    );
    return;
  }

  await requestVolunteerPermit({ chatId: input.chatId, telegramUserId: input.telegramUserId }, reportId);
}

// /submit [permitId] text fallback. With no id, resolves the user's sole active permit so they
// never need to paste a UUID; ambiguous/none -> point them at the buttons.
async function handleVolunteerSubmitCommand(input: Extract<NormalizedTelegramInput, { kind: "text" }>) {
  const explicitPermitId = input.text.trim().split(/\s+/)[1];

  try {
    const permitId = explicitPermitId ?? (await getSoleActivePermitForTelegramUser(input.telegramUserId));

    if (!permitId) {
      await sendMyPermits({ chatId: input.chatId, telegramUserId: input.telegramUserId });
      return;
    }

    await beginFixSubmission({
      chatId: input.chatId,
      telegramUserId: input.telegramUserId,
      messageId: input.messageId,
      permitId
    });
  } catch (error) {
    console.error(error);
    await sendTelegramMessage(input.chatId, "تعذر بدء تقديم الإصلاح الآن. حاول لاحقاً.");
  }
}

// Advance the fix-submission sub-flow and persist the submission when complete.
async function handleFixSubmissionStep(
  conversation: Awaited<ReturnType<typeof getTelegramConversation>>,
  input: NormalizedTelegramInput
) {
  if (!conversation || !conversation.draft.fix) {
    await clearTelegramConversation(input.telegramUserId);
    await sendTelegramMessage(input.chatId, "انتهت جلسة تقديم الإصلاح. أرسل /submit مع رقم التصريح من جديد.");
    return;
  }

  const result = advanceFixSubmission(conversation, conversation.draft.fix as FixSubmissionDraft, input);

  await upsertTelegramConversation({
    ...conversation,
    state: result.state,
    draft: { fix: result.draft }
  });
  // When asking for the optional description, offer a skip button instead of a hidden /skip.
  const replyKeyboard: InlineKeyboard | undefined =
    result.state === "awaiting_fix_description"
      ? [[{ text: "تخطّي الوصف ✓", callbackData: buildCallbackData({ type: "skip" }) }]]
      : undefined;
  await sendTelegramMessage(input.chatId, result.reply, replyKeyboard ? { inlineKeyboard: replyKeyboard } : undefined);

  if (!result.readyToSubmit) {
    return;
  }

  const draft = result.draft;

  if (!isCompleteFixDraft(draft)) {
    await clearTelegramConversation(input.telegramUserId);
    await sendTelegramMessage(input.chatId, "لم يكتمل تقديم الإصلاح. اضغط «حالة بلاغاتي» للمحاولة من جديد.", {
      inlineKeyboard: myPermitsKeyboard()
    });
    return;
  }

  // GPS proximity: the fix must be near the report it claims to fix. If it's too far, keep
  // the conversation at the location step and ask for a corrected location rather than saving
  // a mismatched proof.
  const proximity = await checkFixProximity(draft.reportId, draft.latitude, draft.longitude);
  if (!proximity.ok && proximity.reason === "too_far") {
    await upsertTelegramConversation({
      ...conversation,
      state: "awaiting_fix_location",
      draft: { fix: { ...draft, latitude: undefined, longitude: undefined } }
    });
    await sendTelegramMessage(
      input.chatId,
      `📍 الموقع الذي أرسلته يبعد حوالي ${Math.round(proximity.distanceMeters)} متر عن موقع البلاغ. أرسل موقعك من مكان الإصلاح نفسه.`
    );
    return;
  }

  try {
    const limits = getAbuseLimits();
    const image = await downloadTelegramFile(draft.photoFileId!);
    if (image.bytes.byteLength > limits.maxImageBytes) {
      throw new Error(`Fix image exceeds maximum size: ${image.bytes.byteLength}`);
    }

    const imageUrl = await uploadFixImage({
      permitId: draft.permitId,
      bytes: image.bytes,
      contentType: image.contentType,
      extension: image.extension
    });

    await createFixSubmission({
      permitId: draft.permitId,
      reportId: draft.reportId,
      imageUrl,
      description: draft.description ?? null,
      latitude: draft.latitude ?? null,
      longitude: draft.longitude ?? null,
      source: "telegram"
    });

    await clearTelegramConversation(input.telegramUserId);
    await sendTelegramMessage(
      input.chatId,
      "🎉 تم حفظ صور الإصلاح بنجاح. سيراجعها المشرف ويعتمد نقاطك عند الاكتمال. شكراً لتطوعك!"
    );
  } catch (error) {
    console.error(error);
    await clearTelegramConversation(input.telegramUserId);
    await sendTelegramMessage(input.chatId, "تعذر حفظ صور الإصلاح الآن. اضغط «حالة بلاغاتي» للمحاولة من جديد.", {
      inlineKeyboard: myPermitsKeyboard()
    });
  }
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");

  if (secret !== getTelegramWebhookSecret()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const input = normalizeTelegramUpdate(await request.json());

  if (!input) {
    return NextResponse.json({ ok: true });
  }

  // Idempotency gate: Telegram redelivers updates on slow/non-2xx responses, and this route
  // does heavy work before returning. Claim the update_id first; a replay short-circuits here
  // before any side effect, which is the root guarantee behind the other idempotency fixes.
  const fresh = await claimTelegramUpdate(input.updateId);
  if (!fresh) {
    return NextResponse.json({ ok: true });
  }

  // Inline-keyboard button press: no slash commands, no UUIDs.
  if (input.kind === "callback") {
    await handleCallback(input);
    return NextResponse.json({ ok: true });
  }

  const allowed = await enforceTelegramRateLimit(input.telegramUserId);

  if (!allowed) {
    await sendTelegramMessage(input.chatId, "وصل عدد كبير من الرسائل خلال وقت قصير. حاول مرة أخرى بعد 10 دقائق.");
    return NextResponse.json({ ok: true });
  }

  if (input.kind === "unsupported") {
    await sendTelegramMessage(input.chatId, "نوع الرسالة غير مدعوم. أرسل /start لبدء بلاغ جديد.");
    return NextResponse.json({ ok: true });
  }

  if (input.kind === "text" && input.text.trim().toLowerCase() === "/cancel") {
    const current = await getTelegramConversation(input.telegramUserId);
    const inFix = current ? isFixSubmissionState(current.state) : false;
    await clearTelegramConversation(input.telegramUserId);
    await sendTelegramMessage(
      input.chatId,
      inFix
        ? "تم إلغاء تقديم الإصلاح الحالي. اضغط «حالة بلاغاتي» للمتابعة لاحقاً."
        : "تم إلغاء البلاغ الحالي. أرسل /start لبدء بلاغ جديد.",
      inFix ? { inlineKeyboard: myPermitsKeyboard() } : undefined
    );
    return NextResponse.json({ ok: true });
  }

  if (input.kind === "text" && ["/mypermits", "/myfixes"].includes(input.text.trim().toLowerCase())) {
    await sendMyPermits({ chatId: input.chatId, telegramUserId: input.telegramUserId });
    return NextResponse.json({ ok: true });
  }

  if (input.kind === "text" && input.text.trim().toLowerCase().startsWith("/status")) {
    const reportId = input.text.trim().split(/\s+/)[1];

    if (!reportId) {
      await sendTelegramMessage(input.chatId, "أرسل رقم التتبع بعد الأمر، مثال:\n/status 00000000-0000-0000-0000-000000000000");
      return NextResponse.json({ ok: true });
    }

    const report = await getCitizenReportStatus(reportId);
    if (!report) {
      await sendTelegramMessage(input.chatId, "لم أجد بلاغاً بهذا الرقم. تأكد من رقم التتبع وحاول مرة أخرى.");
      return NextResponse.json({ ok: true });
    }

    await sendTelegramMessage(
      input.chatId,
      [
        `رقم البلاغ: <code>${report.id}</code>`,
        `التصنيف: ${report.ai_category ?? "غير مصنف"}`,
        `الخطورة: ${report.ai_severity ? severityMeta[report.ai_severity].label : "غير محددة"}`,
        `مراجعة AI: ${validationStatusMeta[report.ai_validation_status].label}`,
        `الحالة العامة: ${publicStatusMeta[report.public_status].label}`,
        `الموقع: ${report.city ?? "غير محدد"} - ${report.area ?? "غير محدد"}`,
        `تاريخ الإنشاء: ${formatDateAr(report.created_at)}`
      ].join("\n")
    );
    return NextResponse.json({ ok: true });
  }

  // Web → Telegram volunteer discovery: the public map links to
  // https://t.me/<bot>?start=fix_<reportId>, which Telegram delivers as "/start fix_<reportId>".
  // Route it straight into the volunteer-fix command for that report.
  if (input.kind === "text") {
    const deepLinkReportId = parseVolunteerStartPayload(input.text);
    if (deepLinkReportId) {
      await handleVolunteerFixCommand({ ...input, text: `/fix ${deepLinkReportId}` });
      return NextResponse.json({ ok: true });
    }
  }

  if (input.kind === "text" && input.text.trim().toLowerCase().startsWith("/fix")) {
    await handleVolunteerFixCommand(input);
    return NextResponse.json({ ok: true });
  }

  if (input.kind === "text" && input.text.trim().toLowerCase().startsWith("/submit")) {
    await handleVolunteerSubmitCommand(input);
    return NextResponse.json({ ok: true });
  }

  // Bare /start from a RETURNING reporter: skip the name + phone steps. The pure FSM can't
  // know the user is returning (no DB), so we look up the stored reporter here. A known
  // reporter with a usable name + valid phone is seeded into awaiting_identity_confirmation
  // and asked to confirm or edit; new users / partial records fall through to the normal
  // awaiting_full_name flow. The deep-link /start fix_<id> was already consumed above, and
  // this matches /start by exact equality, so the volunteer link is never intercepted here.
  if (input.kind === "text" && ["/start", "ابدأ", "start"].includes(input.text.trim().toLowerCase())) {
    const seeded = await seedReturningReporter(input);
    if (seeded) {
      await upsertTelegramConversation(seeded);
      await sendTelegramMessage(
        input.chatId,
        [
          "أهلاً بعودتك. سنسجّل البلاغ بنفس بياناتك:",
          `الاسم: ${seeded.draft.fullName}`,
          `الهاتف: ${seeded.draft.phoneNumber}`,
          "",
          "اضغط «متابعة» للمتابعة، أو «تعديل بياناتي» لتغيير الاسم أو الرقم."
        ].join("\n"),
        { inlineKeyboard: identityConfirmKeyboard() }
      );
      return NextResponse.json({ ok: true });
    }
    // New user / partial record: fall through to the standard awaiting_full_name flow below.
  }

  const existingConversation = await getTelegramConversation(input.telegramUserId);

  // If the citizen is mid fix-submission, route to the volunteer sub-flow.
  if (existingConversation && isFixSubmissionState(existingConversation.state)) {
    await handleFixSubmissionStep(existingConversation, input);
    return NextResponse.json({ ok: true });
  }

  // Awaiting a first-time volunteer's display name.
  if (existingConversation && existingConversation.state === "awaiting_volunteer_name" && input.kind === "text") {
    await handleVolunteerNameStep(existingConversation, input);
    return NextResponse.json({ ok: true });
  }

  const step = buildNextStep(existingConversation, input);

  if (step.invalidAttempt) {
    const limits = getAbuseLimits();
    const invalid = recordInvalidAttempt(step.conversation.draft.invalidAttempts, limits.maxInvalidAttempts);

    if (invalid.locked) {
      await recordTelegramAbuseEvent({
        telegramUserId: input.telegramUserId,
        eventType: "invalid_attempt_limit",
        detail: { state: step.conversation.state, messageId: input.messageId }
      });
      await clearTelegramConversation(input.telegramUserId);
      await sendTelegramMessage(input.chatId, "تم إيقاف البلاغ الحالي بسبب كثرة الرسائل غير المناسبة. أرسل /start للبدء من جديد.");
      return NextResponse.json({ ok: true });
    }

    await upsertTelegramConversation({
      ...step.conversation,
      draft: {
        ...step.conversation.draft,
        invalidAttempts: invalid.invalidAttempts
      }
    });
    await sendTelegramMessage(input.chatId, step.reply);
    return NextResponse.json({ ok: true });
  }

  await upsertTelegramConversation({
    ...step.conversation,
    draft: {
      ...step.conversation.draft,
      invalidAttempts: undefined
    }
  });
  await sendTelegramMessage(input.chatId, step.reply);

  if (!step.action) {
    return NextResponse.json({ ok: true });
  }

  const draft = step.conversation.draft;
  const completeDraft = toCompleteDraft(draft);

  if (!completeDraft) {
    await sendTelegramMessage(input.chatId, "لم يكتمل البلاغ. أرسل /start للبدء من جديد.");
    return NextResponse.json({ ok: true });
  }

  try {
    if (step.action === "create_and_analyze") {
      const limits = getAbuseLimits();
      const guardContext = await getTelegramAbuseGuardContext({
        telegramUserId: input.telegramUserId,
        photoFileId: completeDraft.photoFileId,
        latitude: completeDraft.latitude,
        longitude: completeDraft.longitude
      });
      const guard = evaluateSubmissionGuard({
        action: step.action,
        latitude: completeDraft.latitude,
        longitude: completeDraft.longitude,
        limits,
        ...guardContext
      });

      if (!guard.allowed) {
        await recordTelegramAbuseEvent({
          telegramUserId: input.telegramUserId,
          eventType: guard.reason,
          detail: { mode: guard.mode, latitude: completeDraft.latitude, longitude: completeDraft.longitude }
        });

        if (guard.mode === "reject") {
          await clearTelegramConversation(input.telegramUserId);
          await sendTelegramMessage(input.chatId, guardReasonMessages[guard.reason]);
          return NextResponse.json({ ok: true });
        }

        const reportId = await createManualReviewReport({
          telegramUserId: input.telegramUserId,
          chatId: input.chatId,
          messageId: input.messageId,
          draft: completeDraft,
          maxImageBytes: limits.maxImageBytes,
          reason: guardReasonMessages[guard.reason]
        });
        await sendTelegramMessage(
          input.chatId,
          `تم حفظ البلاغ للمراجعة اليدوية بدون تحليل AI.\nرقم التتبع: <code>${reportId}</code>`
        );
        return NextResponse.json({ ok: true });
      }

      const { reportId, analysis } = await createAndAnalyzeReport({
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
        messageId: input.messageId,
        draft: completeDraft,
        maxImageBytes: limits.maxImageBytes
      });
      await sendTelegramMessage(
        input.chatId,
        formatAiAnalysisMessage({ reportId, analysis, askForConfirmation: true })
      );
    }

    if (step.action === "confirm_ai") {
      const reportId = completeDraft.reportId;

      if (!reportId) {
        await sendTelegramMessage(input.chatId, "لم أجد رقم البلاغ المرتبط بهذه المحادثة. أرسل /start لبلاغ جديد.");
        return NextResponse.json({ ok: true });
      }

      await addReportStatusHistory({
        reportId,
        actor: "telegram_bot",
        event: "citizen_ai_confirmed",
        note: "Citizen confirmed the AI analysis in Telegram."
      });
      await clearTelegramConversation(input.telegramUserId);
      await sendTelegramMessage(input.chatId, `تم تثبيت البلاغ.\nرقم التتبع: <code>${reportId}</code>`);
    }

    if (step.action === "reanalyze_with_description") {
      const limits = getAbuseLimits();
      const reportId = completeDraft.reportId;
      const userDescription = completeDraft.userDescription;

      if (!reportId || !userDescription) {
        await sendTelegramMessage(input.chatId, "لم أجد البلاغ أو الوصف المرتبط بهذه المحادثة. أرسل /start لبلاغ جديد.");
        return NextResponse.json({ ok: true });
      }

      const guardContext = await getTelegramAbuseGuardContext({
        telegramUserId: input.telegramUserId,
        photoFileId: completeDraft.photoFileId,
        latitude: completeDraft.latitude,
        longitude: completeDraft.longitude,
        reportId
      });
      const guard = evaluateSubmissionGuard({
        action: step.action,
        latitude: completeDraft.latitude,
        longitude: completeDraft.longitude,
        limits,
        ...guardContext
      });

      if (!guard.allowed) {
        await recordTelegramAbuseEvent({
          telegramUserId: input.telegramUserId,
          eventType: guard.reason,
          detail: { mode: guard.mode, reportId }
        });
        await updateReportCitizenDescription({ reportId, userDescription });
        await markReportForManualAiReview({ reportId, reason: guardReasonMessages[guard.reason] });
        await clearTelegramConversation(input.telegramUserId);
        await sendTelegramMessage(input.chatId, `${guardReasonMessages[guard.reason]}\nرقم التتبع: <code>${reportId}</code>`);
        return NextResponse.json({ ok: true });
      }

      const analysis = await reanalyzeReportWithDescription({
        reportId,
        telegramUserId: input.telegramUserId,
        draft: completeDraft,
        userDescription
      });
      await sendTelegramMessage(
        input.chatId,
        `${formatAiAnalysisMessage({ reportId, analysis, askForConfirmation: false })}\n\nتم تحديث البلاغ بناءً على وصفك.`
      );
    }
  } catch (error) {
    if (step.action === "create_and_analyze") {
      await upsertTelegramConversation({
        ...step.conversation,
        state: "awaiting_location"
      });
    }

    await sendTelegramMessage(
      input.chatId,
      step.action === "create_and_analyze"
        ? "وصلت البيانات لكن تعذر حفظ البلاغ أو تحليله الآن. أعد إرسال الموقع وسأحاول مرة أخرى."
        : "وصلت البيانات لكن تعذر حفظ البلاغ أو تحليله الآن. سنحاول لاحقاً، ويمكنك إرسال /start لبلاغ جديد إذا لزم."
    );
    console.error(error);
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "telegram-webhook" });
}
