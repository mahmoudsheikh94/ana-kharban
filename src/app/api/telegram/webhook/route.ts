import { analyzeReportWithGemini } from "@/lib/ai/gemini";
import { inferJordanArea } from "@/lib/geo/jordan";
import {
  addReportStatusHistory,
  attachTelegramReportToConversation,
  clearTelegramConversation,
  createTelegramReport,
  enforceTelegramRateLimit,
  getCitizenReportStatus,
  getTelegramConversation,
  updateReportCitizenDescription,
  updateReportWithAiAnalysis,
  uploadReportImage,
  upsertTelegramConversation
} from "@/lib/supabase/ingestion";
import { getTelegramWebhookSecret } from "@/lib/supabase/config";
import { downloadTelegramFile, sendTelegramMessage } from "@/lib/telegram/api";
import { buildNextStep, isCompleteDraft } from "@/lib/telegram/flow";
import { normalizeTelegramUpdate } from "@/lib/telegram/update";
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
  draft
}: {
  telegramUserId: string;
  chatId: string;
  messageId?: number;
  draft: CompleteTelegramDraft;
}) {
  const image = await downloadTelegramFile(draft.photoFileId);
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
  await updateReportWithAiAnalysis(reportId, analysis);
  await attachTelegramReportToConversation({ telegramUserId, reportId });

  return { reportId, analysis };
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

  await updateReportWithAiAnalysis(reportId, analysis);
  await clearTelegramConversation(telegramUserId);

  return analysis;
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

  const existingConversation = await getTelegramConversation(input.telegramUserId);
  const step = buildNextStep(existingConversation, input);
  await upsertTelegramConversation(step.conversation);
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
      const { reportId, analysis } = await createAndAnalyzeReport({
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
        messageId: input.messageId,
        draft: completeDraft
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
      const reportId = completeDraft.reportId;
      const userDescription = completeDraft.userDescription;

      if (!reportId || !userDescription) {
        await sendTelegramMessage(input.chatId, "لم أجد البلاغ أو الوصف المرتبط بهذه المحادثة. أرسل /start لبلاغ جديد.");
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
    await sendTelegramMessage(
      input.chatId,
      "وصلت البيانات لكن تعذر حفظ البلاغ أو تحليله الآن. سنحاول لاحقاً، ويمكنك إرسال /start لبلاغ جديد إذا لزم."
    );
    console.error(error);
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "telegram-webhook" });
}
