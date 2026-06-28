import { evaluateSubmissionGuard, recordInvalidAttempt, type SubmissionGuardReason } from "@/lib/abuse/policy";
import { analyzeReportWithGemini } from "@/lib/ai/gemini";
import { inferJordanArea } from "@/lib/geo/jordan";
import {
  addReportStatusHistory,
  attachTelegramReportToConversation,
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
  createFixSubmission,
  getPermitForSubmission,
  getReporterByTelegramId,
  requestPermit,
  upsertVolunteer
} from "@/lib/supabase/permits";
import {
  advanceFixSubmission,
  isCompleteFixDraft,
  isFixSubmissionState,
  parseVolunteerStartPayload,
  startFixSubmission,
  type FixSubmissionDraft
} from "@/lib/telegram/volunteer-flow";
import { getAbuseLimits, getTelegramWebhookSecret } from "@/lib/supabase/config";
import { downloadTelegramFile, sendTelegramMessage } from "@/lib/telegram/api";
import { buildNextStep, isCompleteDraft } from "@/lib/telegram/flow";
import { normalizeTelegramUpdate } from "@/lib/telegram/update";
import type { NormalizedTelegramInput } from "@/lib/telegram/types";
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

async function resolveVolunteerForUser(telegramUserId: string) {
  const reporter = await getReporterByTelegramId(telegramUserId);
  return upsertVolunteer({
    telegramUserId,
    displayName: reporter?.full_name ?? `متطوع ${telegramUserId}`,
    phoneNumber: reporter?.phone_number ?? null
  });
}

// /fix <reportId> — a citizen volunteers to fix an approved report; creates a pending permit.
async function handleVolunteerFixCommand(input: Extract<NormalizedTelegramInput, { kind: "text" }>) {
  const reportId = input.text.trim().split(/\s+/)[1];

  if (!reportId) {
    await sendTelegramMessage(
      input.chatId,
      "أرسل رقم البلاغ بعد الأمر، مثال:\n/fix 00000000-0000-0000-0000-000000000000"
    );
    return;
  }

  try {
    const volunteer = await resolveVolunteerForUser(input.telegramUserId);
    const result = await requestPermit({ reportId, volunteerId: volunteer.id });

    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        report_not_found: "لم أجد بلاغاً بهذا الرقم. تأكد من رقم البلاغ وحاول مرة أخرى.",
        report_not_approved: "هذا البلاغ غير معتمد بعد، لا يمكن التطوع لإصلاحه الآن.",
        report_has_live_permit: "يوجد تصريح نشط لهذا البلاغ بالفعل. اختر بلاغاً آخر."
      };
      await sendTelegramMessage(input.chatId, messages[result.reason]);
      return;
    }

    await sendTelegramMessage(
      input.chatId,
      [
        "تم تسجيل طلب تطوعك لإصلاح هذا البلاغ.",
        `رقم التصريح: <code>${result.permitId}</code>`,
        "بعد موافقة المشرف، أرسل صور الإصلاح عبر:",
        `/submit ${result.permitId}`
      ].join("\n")
    );
  } catch (error) {
    console.error(error);
    await sendTelegramMessage(input.chatId, "تعذر تسجيل طلب التطوع الآن. حاول لاحقاً.");
  }
}

// /submit <permitId> — starts the fix-submission sub-flow for an approved/active permit.
async function handleVolunteerSubmitCommand(input: Extract<NormalizedTelegramInput, { kind: "text" }>) {
  const permitId = input.text.trim().split(/\s+/)[1];

  if (!permitId) {
    await sendTelegramMessage(
      input.chatId,
      "أرسل رقم التصريح بعد الأمر، مثال:\n/submit 00000000-0000-0000-0000-000000000000"
    );
    return;
  }

  try {
    const permit = await getPermitForSubmission(permitId);

    if (!permit) {
      await sendTelegramMessage(input.chatId, "لم أجد تصريحاً بهذا الرقم. تأكد من رقم التصريح.");
      return;
    }

    if (permit.status !== "approved" && permit.status !== "active") {
      await sendTelegramMessage(
        input.chatId,
        "لا يمكن تقديم إصلاح لهذا التصريح في حالته الحالية. انتظر موافقة المشرف."
      );
      return;
    }

    const volunteer = await resolveVolunteerForUser(input.telegramUserId);
    const started = startFixSubmission({
      permitId: permit.id,
      reportId: permit.report_id,
      volunteerId: volunteer.id
    });

    await upsertTelegramConversation({
      telegramUserId: input.telegramUserId,
      chatId: input.chatId,
      state: started.state,
      draft: { fix: started.draft },
      lastMessageId: input.messageId
    });
    await sendTelegramMessage(input.chatId, started.reply);
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
  await sendTelegramMessage(input.chatId, result.reply);

  if (!result.readyToSubmit) {
    return;
  }

  const draft = result.draft;

  if (!isCompleteFixDraft(draft)) {
    await clearTelegramConversation(input.telegramUserId);
    await sendTelegramMessage(input.chatId, "لم يكتمل تقديم الإصلاح. أرسل /submit مع رقم التصريح من جديد.");
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
      `تم حفظ تقديم الإصلاح بنجاح.\nرقم التصريح: <code>${draft.permitId}</code>`
    );
  } catch (error) {
    console.error(error);
    await clearTelegramConversation(input.telegramUserId);
    await sendTelegramMessage(input.chatId, "تعذر حفظ تقديم الإصلاح الآن. أرسل /submit مع رقم التصريح للمحاولة من جديد.");
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
    await clearTelegramConversation(input.telegramUserId);
    await sendTelegramMessage(input.chatId, "تم إلغاء البلاغ الحالي. أرسل /start لبدء بلاغ جديد.");
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

  const existingConversation = await getTelegramConversation(input.telegramUserId);

  // If the citizen is mid fix-submission, route to the volunteer sub-flow.
  if (existingConversation && isFixSubmissionState(existingConversation.state)) {
    await handleFixSubmissionStep(existingConversation, input);
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
