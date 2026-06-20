import "server-only";

import { inferJordanArea } from "@/lib/geo/jordan";
import type { AiReportAnalysis } from "@/lib/ai/gemini";
import type { PublicStatus, Severity, ValidationStatus } from "@/lib/reports/types";
import type { TelegramConversation, TelegramDraft } from "@/lib/telegram/types";
import { getStorageBucketName } from "./config";
import { createSupabaseServerClient } from "./server";

type StoredConversation = {
  telegram_user_id: string;
  chat_id: string;
  state: TelegramConversation["state"];
  draft: TelegramDraft;
  last_message_id: number | null;
};

export async function getTelegramConversation(telegramUserId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("telegram_conversations")
    .select("telegram_user_id, chat_id, state, draft, last_message_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Telegram conversation: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as StoredConversation;
  return {
    telegramUserId: row.telegram_user_id,
    chatId: row.chat_id,
    state: row.state,
    draft: row.draft,
    lastMessageId: row.last_message_id ?? undefined
  } satisfies TelegramConversation;
}

export async function upsertTelegramConversation(conversation: TelegramConversation) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("telegram_conversations").upsert({
    telegram_user_id: conversation.telegramUserId,
    chat_id: conversation.chatId,
    state: conversation.state,
    draft: conversation.draft,
    last_message_id: conversation.lastMessageId ?? null
  });

  if (error) {
    throw new Error(`Failed to save Telegram conversation: ${error.message}`);
  }
}

export async function clearTelegramConversation(telegramUserId: string) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("telegram_conversations").delete().eq("telegram_user_id", telegramUserId);

  if (error) {
    throw new Error(`Failed to clear Telegram conversation: ${error.message}`);
  }
}

export async function uploadReportImage({
  telegramUserId,
  bytes,
  contentType,
  extension
}: {
  telegramUserId: string;
  bytes: Buffer;
  contentType: string;
  extension: string;
}) {
  const supabase = createSupabaseServerClient();
  const path = `telegram/${telegramUserId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(getStorageBucketName()).upload(path, bytes, {
    contentType,
    upsert: false
  });

  if (error) {
    throw new Error(`Failed to upload report image: ${error.message}`);
  }

  const { data } = supabase.storage.from(getStorageBucketName()).getPublicUrl(path);
  return data.publicUrl;
}

export async function createTelegramReport({
  telegramUserId,
  chatId,
  messageId,
  photoFileId,
  imageUrl,
  draft
}: {
  telegramUserId: string;
  chatId: string;
  messageId?: number;
  photoFileId: string;
  imageUrl: string;
  draft: Required<Pick<TelegramDraft, "fullName" | "phoneNumber" | "photoFileId" | "latitude" | "longitude">> &
    Pick<TelegramDraft, "userDescription">;
}) {
  const supabase = createSupabaseServerClient();
  const place = inferJordanArea(draft.latitude, draft.longitude);

  const { data: reporter, error: reporterError } = await supabase
    .from("reporters")
    .upsert(
      {
        telegram_user_id: telegramUserId,
        full_name: draft.fullName,
        phone_number: draft.phoneNumber
      },
      { onConflict: "telegram_user_id" }
    )
    .select("id")
    .single();

  if (reporterError) {
    throw new Error(`Failed to upsert reporter: ${reporterError.message}`);
  }

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .insert({
      reporter_id: reporter.id,
      image_url: imageUrl,
      latitude: draft.latitude,
      longitude: draft.longitude,
      area: place.area,
      city: place.city,
      user_description: draft.userDescription ?? null,
      ai_validation_status: "pending",
      public_status: "new",
      telegram_chat_id: chatId,
      telegram_message_id: messageId ?? null,
      telegram_file_id: photoFileId,
      source: "telegram"
    })
    .select("id")
    .single();

  if (reportError) {
    throw new Error(`Failed to create report: ${reportError.message}`);
  }

  await addReportStatusHistory({
    reportId: report.id,
    actor: "telegram_bot",
    event: "telegram_report_created",
    toStatus: "pending",
    note: "Citizen report received from Telegram."
  });

  return report.id as string;
}

export async function addReportStatusHistory({
  reportId,
  actor,
  event,
  fromStatus,
  toStatus,
  note
}: {
  reportId: string;
  actor: "telegram_bot" | "ai" | "admin" | "system";
  event: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
}) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("report_status_history").insert({
    report_id: reportId,
    actor,
    event,
    from_status: fromStatus ?? null,
    to_status: toStatus ?? null,
    note: note ?? null
  });

  if (error) {
    throw new Error(`Failed to add report status history: ${error.message}`);
  }
}

export async function updateReportWithAiAnalysis(reportId: string, analysis: AiReportAnalysis) {
  const supabase = createSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from("reports")
    .select("ai_validation_status")
    .eq("id", reportId)
    .single();

  if (currentError) {
    throw new Error(`Failed to load current AI status: ${currentError.message}`);
  }

  const { error } = await supabase
    .from("reports")
    .update({
      ai_category: analysis.category,
      ai_severity: analysis.severity,
      ai_confidence: analysis.confidence,
      ai_validation_status: analysis.validationStatus,
      ai_validation_reason: analysis.validationReason,
      ai_image_analysis: analysis.imageAnalysis,
      generated_complaint_arabic: analysis.generatedComplaintArabic,
      ai_reviewed_at: new Date().toISOString()
    })
    .eq("id", reportId);

  if (error) {
    throw new Error(`Failed to update report AI analysis: ${error.message}`);
  }

  await addReportStatusHistory({
    reportId,
    actor: "ai",
    event: "ai_review_completed",
    fromStatus: current.ai_validation_status,
    toStatus: analysis.validationStatus,
    note: analysis.validationReason
  });
}

export async function updateReportManualStatus({
  reportId,
  validationStatus,
  publicStatus,
  note
}: {
  reportId: string;
  validationStatus?: string;
  publicStatus?: string;
  note?: string | null;
}) {
  const supabase = createSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from("reports")
    .select("ai_validation_status, public_status")
    .eq("id", reportId)
    .single();

  if (currentError) {
    throw new Error(`Failed to load report status: ${currentError.message}`);
  }

  const update: Record<string, string> = {
    manual_reviewed_at: new Date().toISOString()
  };

  if (validationStatus) {
    update.ai_validation_status = validationStatus;
  }

  if (publicStatus) {
    update.public_status = publicStatus;
  }

  if (note) {
    update.manual_review_note = note;
  }

  const { error } = await supabase.from("reports").update(update).eq("id", reportId);

  if (error) {
    throw new Error(`Failed to update manual report status: ${error.message}`);
  }

  await addReportStatusHistory({
    reportId,
    actor: "admin",
    event: "manual_status_updated",
    fromStatus: `${current.ai_validation_status}/${current.public_status}`,
    toStatus: `${validationStatus ?? current.ai_validation_status}/${publicStatus ?? current.public_status}`,
    note
  });
}

export async function getCitizenReportStatus(reportId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reports")
    .select("id, ai_validation_status, public_status, ai_category, ai_severity, city, area, created_at")
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load citizen report status: ${error.message}`);
  }

  return data as
    | {
        id: string;
        ai_validation_status: ValidationStatus;
        public_status: PublicStatus;
        ai_category: string | null;
        ai_severity: Severity | null;
        city: string | null;
        area: string | null;
        created_at: string;
      }
    | null;
}

export async function enforceTelegramRateLimit(telegramUserId: string) {
  const supabase = createSupabaseServerClient();
  const maxMessages = 25;
  const windowMs = 10 * 60 * 1000;
  const now = new Date();
  const { data, error } = await supabase
    .from("telegram_rate_limits")
    .select("telegram_user_id, window_started_at, message_count")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check Telegram rate limit: ${error.message}`);
  }

  if (!data || now.getTime() - new Date(data.window_started_at).getTime() > windowMs) {
    const { error: upsertError } = await supabase.from("telegram_rate_limits").upsert({
      telegram_user_id: telegramUserId,
      window_started_at: now.toISOString(),
      message_count: 1
    });

    if (upsertError) {
      throw new Error(`Failed to reset Telegram rate limit: ${upsertError.message}`);
    }

    return true;
  }

  if (data.message_count >= maxMessages) {
    return false;
  }

  const { error: updateError } = await supabase
    .from("telegram_rate_limits")
    .update({ message_count: data.message_count + 1 })
    .eq("telegram_user_id", telegramUserId);

  if (updateError) {
    throw new Error(`Failed to update Telegram rate limit: ${updateError.message}`);
  }

  return true;
}
