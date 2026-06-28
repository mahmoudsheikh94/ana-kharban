import "server-only";

import { addReportStatusHistory, updateReportManualStatus } from "./ingestion";
import { createSupabaseServerClient } from "./server";
import { assertTransition } from "@/lib/permits/transitions";
import { sendTelegramMessage } from "@/lib/telegram/api";
import { buildCallbackData } from "@/lib/telegram/volunteer-flow";
import { scoreFix } from "@/lib/rewards/scoring";
import type {
  FixSubmission,
  Permit,
  PermitStatus,
  Volunteer
} from "@/lib/permits/types";
import { livePermitStatuses } from "@/lib/permits/types";
import type { Report } from "@/lib/reports/types";

export type PermitWithRelations = Permit & {
  report: Pick<
    Report,
    "id" | "ai_category" | "ai_severity" | "city" | "area" | "image_url" | "public_status" | "ai_validation_status"
  > | null;
  volunteer: Volunteer | null;
  fix_submissions?: FixSubmission[];
};

const permitSelect = `
  id,
  report_id,
  volunteer_id,
  status,
  points_awarded,
  admin_note,
  requested_at,
  approved_at,
  completed_at,
  created_at,
  updated_at,
  report:reports (
    id,
    ai_category,
    ai_severity,
    city,
    area,
    image_url,
    public_status,
    ai_validation_status
  ),
  volunteer:volunteers (
    id,
    telegram_user_id,
    display_name,
    phone_number,
    total_points,
    completed_fixes,
    created_at,
    updated_at
  )
`;

function normalizePermit(row: unknown): PermitWithRelations {
  const permit = row as PermitWithRelations & {
    report: (PermitWithRelations["report"] & { ai_severity: string | null }) | null;
  };
  return permit;
}

// Ensure a volunteer row exists for this Telegram user, refreshing the latest name/phone.
export async function upsertVolunteer({
  telegramUserId,
  displayName,
  phoneNumber
}: {
  telegramUserId: string;
  displayName: string;
  phoneNumber?: string | null;
}): Promise<Volunteer> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("volunteers")
    .upsert(
      {
        telegram_user_id: telegramUserId,
        display_name: displayName,
        phone_number: phoneNumber ?? null
      },
      { onConflict: "telegram_user_id" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to upsert volunteer: ${error.message}`);
  }

  return data as Volunteer;
}

// Look up a reporter (the citizen identity) to seed the volunteer's default name/phone.
export async function getReporterByTelegramId(telegramUserId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reporters")
    .select("full_name, phone_number")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load reporter: ${error.message}`);
  }

  return data as { full_name: string; phone_number: string } | null;
}

export type RequestPermitResult =
  | { ok: true; permitId: string }
  | {
      ok: false;
      reason:
        | "report_not_found"
        | "report_not_approved"
        | "report_has_live_permit"
        | "report_already_fixed";
    };

// Create a pending permit for an approved report. Guards against unapproved reports and
// reports that already have a live permit (enforced both here and by a DB unique index).
export async function requestPermit({
  reportId,
  volunteerId
}: {
  reportId: string;
  volunteerId: string;
}): Promise<RequestPermitResult> {
  const supabase = createSupabaseServerClient();

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, ai_validation_status, public_status")
    .eq("id", reportId)
    .maybeSingle();

  if (reportError) {
    throw new Error(`Failed to load report for permit: ${reportError.message}`);
  }

  if (!report) {
    return { ok: false, reason: "report_not_found" };
  }

  if (report.ai_validation_status !== "approved") {
    return { ok: false, reason: "report_not_approved" };
  }

  // Already fixed: don't let a resolved report be re-volunteered (would clutter the list
  // and allow point-farming). A rejected/cancelled *permit* is still re-volunteerable —
  // the live-permit unique index handles that; this only blocks fixed reports.
  if (report.public_status === "fixed") {
    return { ok: false, reason: "report_already_fixed" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("permits")
    .select("id")
    .eq("report_id", reportId)
    .in("status", livePermitStatuses)
    .limit(1);

  if (existingError) {
    throw new Error(`Failed to check existing permits: ${existingError.message}`);
  }

  if (existing && existing.length > 0) {
    return { ok: false, reason: "report_has_live_permit" };
  }

  const { data: permit, error: insertError } = await supabase
    .from("permits")
    .insert({ report_id: reportId, volunteer_id: volunteerId, status: "pending" })
    .select("id")
    .single();

  if (insertError) {
    // Unique index race -> treat as already taken.
    if (insertError.code === "23505") {
      return { ok: false, reason: "report_has_live_permit" };
    }
    throw new Error(`Failed to create permit: ${insertError.message}`);
  }

  await addReportStatusHistory({
    reportId,
    actor: "system",
    event: "permit_requested",
    note: `Permit ${permit.id} requested by volunteer ${volunteerId}.`
  });

  return { ok: true, permitId: permit.id as string };
}

export async function getPermitById(permitId: string): Promise<PermitWithRelations | null> {
  const supabase = createSupabaseServerClient();
  const [{ data, error }, fixesResult] = await Promise.all([
    supabase.from("permits").select(permitSelect).eq("id", permitId).maybeSingle(),
    supabase
      .from("fix_submissions")
      .select("*")
      .eq("permit_id", permitId)
      .order("created_at", { ascending: false })
  ]);

  if (error) {
    throw new Error(`Failed to load permit: ${error.message}`);
  }

  if (fixesResult.error) {
    throw new Error(`Failed to load fix submissions: ${fixesResult.error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    ...normalizePermit(data),
    fix_submissions: (fixesResult.data ?? []) as FixSubmission[]
  };
}

export async function getPermits(status?: PermitStatus): Promise<PermitWithRelations[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase.from("permits").select(permitSelect).order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load permits: ${error.message}`);
  }

  return ((data ?? []) as unknown[]).map(normalizePermit);
}

// Simple status moves (approve / activate / reject / cancel). `completed` has its own path.
export async function transitionPermit({
  permitId,
  to,
  note
}: {
  permitId: string;
  to: Exclude<PermitStatus, "completed">;
  note?: string | null;
}) {
  const supabase = createSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from("permits")
    .select("status")
    .eq("id", permitId)
    .single();

  if (currentError) {
    throw new Error(`Failed to load permit status: ${currentError.message}`);
  }

  const from = current.status as PermitStatus;
  assertTransition(from, to);

  const update: Record<string, string | null> = { status: to };
  if (typeof note === "string" || note === null) {
    update.admin_note = note;
  }
  if (to === "approved") {
    update.approved_at = new Date().toISOString();
  }

  const { error } = await supabase.from("permits").update(update).eq("id", permitId);

  if (error) {
    throw new Error(`Failed to transition permit: ${error.message}`);
  }

  // On activation, push the volunteer a button to submit fix photos — no command, no UUID.
  if (to === "active") {
    await notifyVolunteerPermitActive(permitId);
  }
}

// Push the volunteer a "send fix photos" button the moment their permit goes active. In a
// private chat the Telegram chat_id equals the user id, so we DM telegram_user_id directly.
// Best-effort: a delivery failure must not break the admin's activation.
async function notifyVolunteerPermitActive(permitId: string) {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("permits")
      .select("id, volunteer:volunteers (telegram_user_id), report:reports (ai_category)")
      .eq("id", permitId)
      .maybeSingle();

    if (error || !data) {
      return;
    }

    const row = data as unknown as {
      id: string;
      volunteer: { telegram_user_id: string | null } | null;
      report: { ai_category: string | null } | null;
    };
    const telegramUserId = row.volunteer?.telegram_user_id;
    if (!telegramUserId) {
      return;
    }

    const category = row.report?.ai_category ?? "البلاغ";
    await sendTelegramMessage(
      telegramUserId,
      [
        "✅ تمت الموافقة على تطوعك!",
        `يمكنك الآن إرسال صور إصلاح: ${category}.`,
        "اضغط الزر أدناه للبدء."
      ].join("\n"),
      {
        inlineKeyboard: [
          [{ text: "📸 أرسل صور الإصلاح", callbackData: buildCallbackData({ type: "submit", permitId }) }]
        ]
      }
    );
  } catch (error) {
    console.error("Failed to notify volunteer of permit activation", error);
  }
}

// Complete a permit: award points, mark the report fixed, bump volunteer counters, and write
// a ledger entry. Idempotent, race-safe, AND crash-safe — a double-click, webhook replay, or
// a retry after a mid-completion failure can never double-award or leave the volunteer's
// counters short. The guards:
//   1. An atomic conditional status flip (UPDATE ... WHERE status = expected). Only one
//      concurrent caller wins; the others see 0 rows. A retry after the flip already happened
//      observes status='completed' and takes the self-heal path instead of bailing.
//   2. award_fix_points() inserts the ledger row AND bumps the counters in ONE transaction,
//      keyed on a unique permit_id (ON CONFLICT DO NOTHING). Running it twice is a no-op;
//      running it after a crash that committed the flip but not the award repairs the counter.
//   3. The report-fixed step is an idempotent status write, safe to re-run.
export async function completePermit({
  permitId,
  note
}: {
  permitId: string;
  note?: string | null;
}) {
  const permit = await getPermitById(permitId);

  if (!permit) {
    throw new Error("Permit not found");
  }

  const supabase = createSupabaseServerClient();
  const points =
    permit.status === "completed"
      ? permit.points_awarded
      : scoreFix(permit.report?.ai_severity ?? null, permit.report?.ai_category ?? null);

  // (1) Move the permit to completed unless it already is. Concurrent callers race on the
  // conditional flip; the loser updates 0 rows and stops. An already-completed permit skips
  // the flip and falls through to the idempotent award/heal steps below.
  if (permit.status !== "completed") {
    assertTransition(permit.status, "completed");

    const { data: flipped, error: permitError } = await supabase
      .from("permits")
      .update({
        status: "completed",
        points_awarded: points,
        completed_at: new Date().toISOString(),
        ...(typeof note === "string" || note === null ? { admin_note: note } : {})
      })
      .eq("id", permitId)
      .eq("status", permit.status)
      .select("id");

    if (permitError) {
      throw new Error(`Failed to complete permit: ${permitError.message}`);
    }

    if (!flipped || flipped.length === 0) {
      return; // lost the race; the winner runs the award/heal steps
    }
  }

  // (2) Atomic award (ledger + counters together). Returns true when it actually awarded,
  // false when this permit was already awarded (a no-op replay).
  const { data: awarded, error: awardError } = await supabase.rpc("award_fix_points", {
    p_volunteer_id: permit.volunteer_id,
    p_permit_id: permitId,
    p_points: points,
    p_reason: `Completed fix for report ${permit.report_id}`
  });

  if (awardError) {
    throw new Error(`Failed to award fix points: ${awardError.message}`);
  }

  // Nothing newly applied (already-completed AND already-awarded): true no-op, avoid writing
  // a duplicate "fixed" history row on repeated complete clicks.
  if (awarded === false) {
    return;
  }

  // (3) Reflect the fix on the public report status + history (runs on a fresh completion or
  // when healing a prior partial one). updateReportManualStatus is idempotent on status.
  await updateReportManualStatus({
    reportId: permit.report_id,
    publicStatus: "fixed",
    note: `Marked fixed via permit ${permitId} (+${points} points).`
  });
}

// Insert a fix submission (from Telegram or the public upload endpoint).
export async function createFixSubmission({
  permitId,
  reportId,
  imageUrl,
  description,
  latitude,
  longitude,
  source
}: {
  permitId: string;
  reportId: string;
  imageUrl: string;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source: "telegram" | "upload";
}): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("fix_submissions")
    .insert({
      permit_id: permitId,
      report_id: reportId,
      image_url: imageUrl,
      description: description ?? null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      source
    })
    .select("id")
    .single();

  if (error) {
    // unique(permit_id, image_url): a double-clicked upload or replayed Telegram update
    // re-submitted the same proof. Return the existing row instead of creating a duplicate.
    if (error.code === "23505") {
      const { data: existing, error: existingError } = await supabase
        .from("fix_submissions")
        .select("id")
        .eq("permit_id", permitId)
        .eq("image_url", imageUrl)
        .single();

      if (existingError) {
        throw new Error(`Failed to load existing fix submission: ${existingError.message}`);
      }

      return existing.id as string;
    }

    throw new Error(`Failed to create fix submission: ${error.message}`);
  }

  await addReportStatusHistory({
    reportId,
    actor: source === "telegram" ? "telegram_bot" : "system",
    event: "fix_submitted",
    note: `Fix proof submitted for permit ${permitId} via ${source}.`
  });

  return data.id as string;
}

// Load a permit for the upload endpoint: must exist and be approved/active.
export async function getPermitForSubmission(permitId: string) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("permits")
    .select("id, report_id, status")
    .eq("id", permitId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load permit for submission: ${error.message}`);
  }

  return data as { id: string; report_id: string; status: PermitStatus } | null;
}

export type VolunteerPermitSummary = {
  id: string;
  status: PermitStatus;
  reportId: string;
  reportCategory: string | null;
  city: string | null;
};

// All permits held by a Telegram user (most recent first), for the "my permits" button —
// so a volunteer who lost the chat can always see status and resume an active permit.
export async function getVolunteerPermitsByTelegramId(
  telegramUserId: string
): Promise<VolunteerPermitSummary[]> {
  const supabase = createSupabaseServerClient();
  const { data: volunteer, error: volError } = await supabase
    .from("volunteers")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (volError) {
    throw new Error(`Failed to load volunteer: ${volError.message}`);
  }
  if (!volunteer) {
    return [];
  }

  const { data, error } = await supabase
    .from("permits")
    .select("id, status, report_id, report:reports (ai_category, city)")
    .eq("volunteer_id", volunteer.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load volunteer permits: ${error.message}`);
  }

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as {
      id: string;
      status: PermitStatus;
      report_id: string;
      report: { ai_category: string | null; city: string | null } | null;
    };
    return {
      id: r.id,
      status: r.status,
      reportId: r.report_id,
      reportCategory: r.report?.ai_category ?? null,
      city: r.report?.city ?? null
    };
  });
}

// Resolve a Telegram user's single active permit (for the zero-arg /submit fallback).
// Returns null if they have none or more than one (ambiguous -> use buttons instead).
export async function getSoleActivePermitForTelegramUser(
  telegramUserId: string
): Promise<string | null> {
  const permits = await getVolunteerPermitsByTelegramId(telegramUserId);
  const active = permits.filter((permit) => permit.status === "active");
  return active.length === 1 ? active[0].id : null;
}
