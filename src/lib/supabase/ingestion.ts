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

function startOfDayIso() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function startOfWeekIso() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString();
}

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

export async function uploadFixImage({
  permitId,
  bytes,
  contentType,
  extension
}: {
  permitId: string;
  bytes: Buffer;
  contentType: string;
  extension: string;
}) {
  const supabase = createSupabaseServerClient();
  const path = `fixes/${permitId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(getStorageBucketName()).upload(path, bytes, {
    contentType,
    upsert: false
  });

  if (error) {
    throw new Error(`Failed to upload fix image: ${error.message}`);
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

// Idempotency gate for the Telegram webhook. Records an update_id the first time it is
// seen and returns true; a redelivered update (same update_id) hits the primary-key
// conflict and returns false so the caller can short-circuit before doing any work.
// Updates without an update_id (shouldn't happen in practice) are always allowed through.
export async function claimTelegramUpdate(updateId: number | undefined): Promise<boolean> {
  if (typeof updateId !== "number") {
    return true;
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("telegram_processed_updates")
    .insert({ update_id: updateId });

  if (!error) {
    return true;
  }

  if (error.code === "23505") {
    return false; // already processed
  }

  throw new Error(`Failed to claim Telegram update: ${error.message}`);
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

export async function markReportForManualAiReview({
  reportId,
  reason
}: {
  reportId: string;
  reason: string;
}) {
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
      ai_category: "مراجعة يدوية",
      ai_severity: "medium",
      ai_confidence: 0,
      ai_validation_status: "needs_more_info",
      ai_validation_reason: reason,
      ai_image_analysis: "تم تخطي تحليل Gemini بسبب حدود الحماية من إساءة الاستخدام.",
      generated_complaint_arabic: "يحتاج هذا البلاغ إلى مراجعة يدوية قبل إرساله للجهة المختصة."
    })
    .eq("id", reportId);

  if (error) {
    throw new Error(`Failed to mark report for manual AI review: ${error.message}`);
  }

  await addReportStatusHistory({
    reportId,
    actor: "system",
    event: "ai_review_skipped",
    fromStatus: current.ai_validation_status,
    toStatus: "needs_more_info",
    note: reason
  });
}

export async function attachTelegramReportToConversation({
  telegramUserId,
  reportId
}: {
  telegramUserId: string;
  reportId: string;
}) {
  const conversation = await getTelegramConversation(telegramUserId);

  if (!conversation) {
    return;
  }

  await upsertTelegramConversation({
    ...conversation,
    draft: {
      ...conversation.draft,
      reportId
    }
  });
}

export async function updateReportCitizenDescription({
  reportId,
  userDescription
}: {
  reportId: string;
  userDescription: string;
}) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("reports")
    .update({
      user_description: userDescription
    })
    .eq("id", reportId);

  if (error) {
    throw new Error(`Failed to update citizen report description: ${error.message}`);
  }

  await addReportStatusHistory({
    reportId,
    actor: "telegram_bot",
    event: "citizen_description_added",
    note: userDescription
  });
}

export async function recordAiUsageEvent({
  telegramUserId,
  reportId,
  purpose
}: {
  telegramUserId: string;
  reportId: string;
  purpose: "initial_analysis" | "reanalyze_with_description";
}) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ai_usage_events").insert({
    telegram_user_id: telegramUserId,
    report_id: reportId,
    purpose
  });

  if (error) {
    throw new Error(`Failed to record AI usage event: ${error.message}`);
  }
}

export async function recordTelegramAbuseEvent({
  telegramUserId,
  eventType,
  detail
}: {
  telegramUserId: string;
  eventType: string;
  detail?: Record<string, unknown>;
}) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("telegram_abuse_events").insert({
    telegram_user_id: telegramUserId,
    event_type: eventType,
    detail: detail ?? {}
  });

  if (error) {
    throw new Error(`Failed to record Telegram abuse event: ${error.message}`);
  }
}

export async function getTelegramAbuseGuardContext({
  telegramUserId,
  photoFileId,
  latitude,
  longitude,
  reportId
}: {
  telegramUserId: string;
  photoFileId?: string;
  latitude: number;
  longitude: number;
  reportId?: string;
}) {
  const supabase = createSupabaseServerClient();
  const today = startOfDayIso();
  const week = startOfWeekIso();

  const [
    blockedResult,
    userAiResult,
    globalAiResult,
    reporterResult,
    duplicateFileResult,
    reanalysisResult
  ] = await Promise.all([
    supabase.from("telegram_blocked_users").select("telegram_user_id").eq("telegram_user_id", telegramUserId).maybeSingle(),
    supabase
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("telegram_user_id", telegramUserId)
      .gte("created_at", today),
    supabase.from("ai_usage_events").select("id", { count: "exact", head: true }).gte("created_at", today),
    supabase.from("reporters").select("id").eq("telegram_user_id", telegramUserId).maybeSingle(),
    photoFileId
      ? supabase.from("reports").select("id", { count: "exact", head: true }).eq("telegram_file_id", photoFileId)
      : Promise.resolve({ count: 0, error: null }),
    reportId
      ? supabase
          .from("ai_usage_events")
          .select("id", { count: "exact", head: true })
          .eq("report_id", reportId)
          .eq("purpose", "reanalyze_with_description")
      : Promise.resolve({ count: 0, error: null })
  ]);

  for (const result of [blockedResult, userAiResult, globalAiResult, reporterResult, duplicateFileResult, reanalysisResult]) {
    if (result.error) {
      throw new Error(`Failed to load Telegram abuse guard context: ${result.error.message}`);
    }
  }

  const reporterId = reporterResult.data?.id as string | undefined;
  let userReportsThisWeek = 0;
  let duplicateNearbyReport = false;

  if (reporterId) {
    const [weeklyResult, nearbyResult] = await Promise.all([
      supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("reporter_id", reporterId)
        .eq("source", "telegram")
        .gte("created_at", week),
      supabase
        .from("reports")
        .select("id")
        .eq("reporter_id", reporterId)
        .eq("source", "telegram")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .gte("latitude", latitude - 0.0015)
        .lte("latitude", latitude + 0.0015)
        .gte("longitude", longitude - 0.0015)
        .lte("longitude", longitude + 0.0015)
        .limit(1)
    ]);

    if (weeklyResult.error || nearbyResult.error) {
      throw new Error(`Failed to load Telegram report guard context: ${weeklyResult.error?.message ?? nearbyResult.error?.message}`);
    }

    userReportsThisWeek = weeklyResult.count ?? 0;
    duplicateNearbyReport = Boolean(nearbyResult.data?.length);
  }

  return {
    blocked: Boolean(blockedResult.data),
    userAiCallsToday: userAiResult.count ?? 0,
    globalAiCallsToday: globalAiResult.count ?? 0,
    userReportsThisWeek,
    duplicateFile: (duplicateFileResult.count ?? 0) > 0,
    duplicateNearbyReport,
    reanalysisCountForReport: reanalysisResult.count ?? 0
  };
}

export async function getTelegramAbuseAdminData() {
  const supabase = createSupabaseServerClient();
  const since = startOfDayIso();
  const [eventsResult, blockedResult, usageResult] = await Promise.all([
    supabase.from("telegram_abuse_events").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("telegram_blocked_users").select("*").order("blocked_at", { ascending: false }),
    supabase.from("ai_usage_events").select("telegram_user_id, created_at").gte("created_at", since)
  ]);

  if (eventsResult.error || blockedResult.error || usageResult.error) {
    throw new Error(
      `Failed to load abuse admin data: ${eventsResult.error?.message ?? blockedResult.error?.message ?? usageResult.error?.message}`
    );
  }

  return {
    events: eventsResult.data ?? [],
    blockedUsers: blockedResult.data ?? [],
    aiUsageToday: usageResult.data ?? []
  };
}

export async function blockTelegramUser({
  telegramUserId,
  reason
}: {
  telegramUserId: string;
  reason: string;
}) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("telegram_blocked_users").upsert({
    telegram_user_id: telegramUserId,
    reason,
    blocked_by: "admin"
  });

  if (error) {
    throw new Error(`Failed to block Telegram user: ${error.message}`);
  }
}

export async function unblockTelegramUser(telegramUserId: string) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("telegram_blocked_users").delete().eq("telegram_user_id", telegramUserId);

  if (error) {
    throw new Error(`Failed to unblock Telegram user: ${error.message}`);
  }
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

// IP-based rate limit for the public, anonymous fix-upload endpoint. Mirrors the Telegram
// limiter: a fixed window per client IP. Returns false once the cap is hit so the caller can
// respond 429. Conservative default: 10 uploads / 10 minutes per IP.
export async function enforceFixUploadRateLimit(clientIp: string) {
  const supabase = createSupabaseServerClient();
  const maxRequests = 10;
  const windowMs = 10 * 60 * 1000;
  const now = new Date();
  const { data, error } = await supabase
    .from("fix_upload_rate_limits")
    .select("client_ip, window_started_at, request_count")
    .eq("client_ip", clientIp)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check fix upload rate limit: ${error.message}`);
  }

  if (!data || now.getTime() - new Date(data.window_started_at).getTime() > windowMs) {
    const { error: upsertError } = await supabase.from("fix_upload_rate_limits").upsert({
      client_ip: clientIp,
      window_started_at: now.toISOString(),
      request_count: 1
    });

    if (upsertError) {
      throw new Error(`Failed to reset fix upload rate limit: ${upsertError.message}`);
    }

    return true;
  }

  if (data.request_count >= maxRequests) {
    return false;
  }

  const { error: updateError } = await supabase
    .from("fix_upload_rate_limits")
    .update({ request_count: data.request_count + 1 })
    .eq("client_ip", clientIp);

  if (updateError) {
    throw new Error(`Failed to update fix upload rate limit: ${updateError.message}`);
  }

  return true;
}
