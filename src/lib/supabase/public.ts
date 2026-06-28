import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePublishableKey, getSupabaseUrl } from "./config";
import type { FixSubmission, PublicVolunteer } from "@/lib/permits/types";
import type { ReportWithReporter } from "@/lib/reports/types";

// The public transparency layer reads with the publishable (anon) key so Postgres RLS
// actually governs what is exposed. The anon policies return only approved reports,
// completed permits, and fix submissions whose permit is completed. On `volunteers`,
// anon has column-level SELECT on safe columns only (no phone_number / telegram_user_id),
// so the query below cannot widen the exposure even if it tried.
function createSupabasePublicClient() {
  return createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

const publicVolunteerColumns = "id, display_name, total_points, completed_fixes, created_at";

export async function getPublicApprovedReports() {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, image_url, latitude, longitude, area, city, ai_category, ai_severity, ai_validation_status, public_status, created_at"
    )
    .eq("ai_validation_status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load public reports: ${error.message}`);
  }

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      ...row,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      ai_confidence: null,
      reporter: null
    }))
    .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude)) as unknown as ReportWithReporter[];
}

export async function getLeaderboard(limit = 50): Promise<PublicVolunteer[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("volunteers")
    .select(publicVolunteerColumns)
    .order("total_points", { ascending: false })
    .order("completed_fixes", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load leaderboard: ${error.message}`);
  }

  return (data ?? []) as PublicVolunteer[];
}

export async function getPublicVolunteer(id: string): Promise<PublicVolunteer | null> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("volunteers")
    .select(publicVolunteerColumns)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load volunteer: ${error.message}`);
  }

  return (data as PublicVolunteer) ?? null;
}

export type PublicFix = FixSubmission & {
  report: {
    id: string;
    ai_category: string | null;
    ai_severity: string | null;
    city: string | null;
    area: string | null;
    image_url: string;
  } | null;
};

const publicFixSelect = `
  id,
  permit_id,
  report_id,
  image_url,
  description,
  latitude,
  longitude,
  source,
  created_at,
  report:reports (
    id,
    ai_category,
    ai_severity,
    city,
    area,
    image_url
  )
`;

export async function getPublicFixes(limit = 60): Promise<PublicFix[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("fix_submissions")
    .select(publicFixSelect)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load public fixes: ${error.message}`);
  }

  return ((data ?? []) as unknown[]) as PublicFix[];
}

export async function getVolunteerCompletedPermits(volunteerId: string) {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("permits")
    .select(
      "id, report_id, points_awarded, completed_at, report:reports (id, ai_category, ai_severity, city, area, image_url)"
    )
    .eq("volunteer_id", volunteerId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load volunteer permits: ${error.message}`);
  }

  return ((data ?? []) as unknown[]) as Array<{
    id: string;
    report_id: string;
    points_awarded: number;
    completed_at: string | null;
    report: {
      id: string;
      ai_category: string | null;
      ai_severity: string | null;
      city: string | null;
      area: string | null;
      image_url: string;
    } | null;
  }>;
}

export async function getPublicStats() {
  const supabase = createSupabasePublicClient();
  const [reportsResult, fixesResult, volunteersResult] = await Promise.all([
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("ai_validation_status", "approved"),
    supabase.from("fix_submissions").select("id", { count: "exact", head: true }),
    supabase.from("volunteers").select("id", { count: "exact", head: true })
  ]);

  if (reportsResult.error || fixesResult.error || volunteersResult.error) {
    throw new Error(
      `Failed to load public stats: ${reportsResult.error?.message ?? fixesResult.error?.message ?? volunteersResult.error?.message}`
    );
  }

  return {
    approvedReports: reportsResult.count ?? 0,
    fixes: fixesResult.count ?? 0,
    volunteers: volunteersResult.count ?? 0
  };
}
