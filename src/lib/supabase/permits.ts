import "server-only";

import { addReportStatusHistory, updateReportManualStatus } from "./ingestion";
import { createSupabaseServerClient } from "./server";
import { assertTransition } from "@/lib/permits/transitions";
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
  | { ok: false; reason: "report_not_found" | "report_not_approved" | "report_has_live_permit" };

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
    .select("id, ai_validation_status")
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
}

// Complete a permit: award points, mark the report fixed, bump volunteer counters, and
// write a ledger entry. Idempotent — completing an already-completed permit is a no-op.
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

  if (permit.status === "completed") {
    return; // idempotent: already awarded
  }

  assertTransition(permit.status, "completed");

  const supabase = createSupabaseServerClient();
  const points = scoreFix(permit.report?.ai_severity ?? null, permit.report?.ai_category ?? null);

  const { error: permitError } = await supabase
    .from("permits")
    .update({
      status: "completed",
      points_awarded: points,
      completed_at: new Date().toISOString(),
      ...(typeof note === "string" || note === null ? { admin_note: note } : {})
    })
    .eq("id", permitId);

  if (permitError) {
    throw new Error(`Failed to complete permit: ${permitError.message}`);
  }

  // Bump denormalized volunteer counters.
  const { error: counterError } = await supabase
    .from("volunteers")
    .update({
      total_points: (permit.volunteer?.total_points ?? 0) + points,
      completed_fixes: (permit.volunteer?.completed_fixes ?? 0) + 1
    })
    .eq("id", permit.volunteer_id);

  if (counterError) {
    throw new Error(`Failed to update volunteer counters: ${counterError.message}`);
  }

  const { error: ledgerError } = await supabase.from("points_ledger").insert({
    volunteer_id: permit.volunteer_id,
    permit_id: permitId,
    points,
    reason: `Completed fix for report ${permit.report_id}`
  });

  if (ledgerError) {
    throw new Error(`Failed to write points ledger: ${ledgerError.message}`);
  }

  // Reflect the fix on the public report status + history.
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
