import { analyzeReportWithGemini } from "@/lib/ai/gemini";
import { inferJordanArea } from "@/lib/geo/jordan";
import {
  clearTelegramConversation,
  createTelegramReport,
  getCitizenReportStatus,
  getTelegramConversation,
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

export async function POST(request: Request) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");

  if (secret !== getTelegramWebhookSecret()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const input = normalizeTelegramUpdate(await request.json());

  if (!input) {
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

  if (!step.readyToSubmit) {
    return NextResponse.json({ ok: true });
  }

  const draft = step.conversation.draft;

  if (!isCompleteDraft(draft)) {
    await sendTelegramMessage(input.chatId, "لم يكتمل البلاغ. أرسل /start للبدء من جديد.");
    return NextResponse.json({ ok: true });
  }

  const completeDraft = {
    fullName: draft.fullName,
    phoneNumber: draft.phoneNumber,
    photoFileId: draft.photoFileId,
    latitude: draft.latitude,
    longitude: draft.longitude,
    userDescription: draft.userDescription
  } as {
    fullName: string;
    phoneNumber: string;
    photoFileId: string;
    latitude: number;
    longitude: number;
    userDescription?: string | null;
  };

  try {
    const image = await downloadTelegramFile(completeDraft.photoFileId);
    const imageUrl = await uploadReportImage({
      telegramUserId: input.telegramUserId,
      bytes: image.bytes,
      contentType: image.contentType,
      extension: image.extension
    });

    const reportId = await createTelegramReport({
      telegramUserId: input.telegramUserId,
      chatId: input.chatId,
      messageId: input.messageId,
      photoFileId: completeDraft.photoFileId,
      imageUrl,
      draft: completeDraft
    });

    const place = inferJordanArea(completeDraft.latitude, completeDraft.longitude);
    const analysis = await analyzeReportWithGemini({
      imageBytes: image.bytes,
      mimeType: image.contentType,
      city: place.city,
      area: place.area,
      latitude: completeDraft.latitude,
      longitude: completeDraft.longitude,
      userDescription: completeDraft.userDescription ?? null
    });
    await updateReportWithAiAnalysis(reportId, analysis);
    await clearTelegramConversation(input.telegramUserId);

    await sendTelegramMessage(
      input.chatId,
      `تم تسجيل البلاغ وتحليله.\nرقم التتبع: <code>${reportId}</code>\nالتصنيف: ${analysis.category}\nالخطورة: ${analysis.severity}\nالحالة: ${analysis.validationStatus}`
    );
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
