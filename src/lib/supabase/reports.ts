import "server-only";

import { calculateDashboardMetrics } from "@/lib/reports/metrics";
import { pickCanonicalDuplicate, type DuplicateCandidate } from "@/lib/reports/duplicates";
import type { Report, ReportFilters, ReportWithReporter } from "@/lib/reports/types";
import { getDuplicateRadiusDeg } from "./config";
import { addReportStatusHistory, updateReportManualStatus } from "./ingestion";
import { createSupabaseServerClient } from "./server";

const reportSelect = `
  id,
  reporter_id,
  image_url,
  latitude,
  longitude,
  area,
  city,
  user_description,
  ai_category,
  ai_severity,
  ai_confidence,
  ai_validation_status,
  ai_validation_reason,
  ai_image_analysis,
  generated_complaint_arabic,
  public_status,
  telegram_chat_id,
  telegram_message_id,
  telegram_file_id,
  source,
  ai_reviewed_at,
  manual_reviewed_at,
  manual_review_note,
  possible_duplicate_of,
  duplicate_of,
  dup_checked_at,
  created_at,
  updated_at,
  reporter:reporters (
    id,
    telegram_user_id,
    full_name,
    phone_number,
    created_at
  )
`;

type RawReportWithReporter = Omit<ReportWithReporter, "latitude" | "longitude" | "ai_confidence"> & {
  latitude: number | string;
  longitude: number | string;
  ai_confidence: number | string | null;
};

function normalizeReport(report: RawReportWithReporter): ReportWithReporter {
  return {
    ...report,
    latitude: Number(report.latitude),
    longitude: Number(report.longitude),
    ai_confidence: report.ai_confidence === null ? null : Number(report.ai_confidence),
    status_history: report.status_history ?? []
  };
}

function applyFilters<T>(
  query: T,
  filters: ReportFilters
): T {
  let filtered = query as T & {
    eq: (column: string, value: string) => typeof filtered;
    gte: (column: string, value: string) => typeof filtered;
    lte: (column: string, value: string) => typeof filtered;
  };

  if (filters.status) {
    filtered = filtered.eq("ai_validation_status", filters.status);
  }

  if (filters.severity) {
    filtered = filtered.eq("ai_severity", filters.severity);
  }

  if (filters.category) {
    filtered = filtered.eq("ai_category", filters.category);
  }

  if (filters.city) {
    filtered = filtered.eq("city", filters.city);
  }

  if (filters.area) {
    filtered = filtered.eq("area", filters.area);
  }

  if (filters.from) {
    filtered = filtered.gte("created_at", `${filters.from}T00:00:00.000Z`);
  }

  if (filters.to) {
    filtered = filtered.lte("created_at", `${filters.to}T23:59:59.999Z`);
  }

  return filtered as T;
}

export async function getReports(filters: ReportFilters = {}) {
  const supabase = createSupabaseServerClient();
  const query = supabase.from("reports").select(reportSelect).order("created_at", { ascending: false });
  const { data, error } = await applyFilters(query, filters);

  if (error) {
    throw new Error(`Failed to load reports: ${error.message}`);
  }

  return ((data ?? []) as unknown as RawReportWithReporter[]).map(normalizeReport);
}

export async function getReportById(id: string) {
  const supabase = createSupabaseServerClient();
  const [{ data, error }, historyResult] = await Promise.all([
    supabase.from("reports").select(reportSelect).eq("id", id).maybeSingle(),
    supabase.from("report_status_history").select("*").eq("report_id", id).order("created_at", { ascending: true })
  ]);

  if (error) {
    throw new Error(`Failed to load report: ${error.message}`);
  }

  if (historyResult.error) {
    throw new Error(`Failed to load report status history: ${historyResult.error.message}`);
  }

  return data
    ? normalizeReport({
        ...(data as unknown as RawReportWithReporter),
        status_history: historyResult.data ?? []
      })
    : null;
}

export async function getApprovedMapReports() {
  const reports = await getReports({ status: "approved" });
  return reports.filter((report) => Number.isFinite(report.latitude) && Number.isFinite(report.longitude));
}

export async function getDashboardData() {
  const reports = await getReports();
  return {
    reports,
    metrics: calculateDashboardMetrics(reports),
    recentReports: reports.slice(0, 6)
  };
}

export async function getReportFilterOptions() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reports")
    .select("ai_category, city, area")
    .order("city", { ascending: true });

  if (error) {
    throw new Error(`Failed to load report filters: ${error.message}`);
  }

  const rows = (data ?? []) as Pick<Report, "ai_category" | "city" | "area">[];

  return {
    categories: [...new Set(rows.map((row) => row.ai_category).filter(Boolean))] as string[],
    cities: [...new Set(rows.map((row) => row.city).filter(Boolean))] as string[],
    areas: [...new Set(rows.map((row) => row.area).filter(Boolean))] as string[]
  };
}

// Cross-user duplicate detection. Finds an existing live report close to (lat,lng) with the
// same ai_category and, on a hit, records it as a possible duplicate on the new report.
// Returns the canonical (oldest) original's id, or null when none. Run at intake, after AI
// analysis. Pre-filters candidates with a bounding box + category in SQL, then applies the
// exact predicate in pure code (lib/reports/duplicates.ts).
export async function detectAndFlagDuplicate({
  reportId,
  latitude,
  longitude,
  aiCategory
}: {
  reportId: string;
  latitude: number;
  longitude: number;
  aiCategory: string | null;
}): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const radius = getDuplicateRadiusDeg();

  // No category -> nothing to match on. Still stamp dup_checked_at so we know it ran.
  if (!aiCategory || !aiCategory.trim()) {
    await supabase.from("reports").update({ dup_checked_at: new Date().toISOString() }).eq("id", reportId);
    return null;
  }

  const { data, error } = await supabase
    .from("reports")
    .select("id, latitude, longitude, ai_category, created_at")
    .eq("ai_category", aiCategory)
    .in("ai_validation_status", ["approved", "pending"])
    .is("duplicate_of", null)
    .neq("id", reportId)
    .gte("latitude", latitude - radius)
    .lte("latitude", latitude + radius)
    .gte("longitude", longitude - radius)
    .lte("longitude", longitude + radius);

  if (error) {
    throw new Error(`Failed to query duplicate candidates: ${error.message}`);
  }

  const candidates: DuplicateCandidate[] = (data ?? []).map((row) => ({
    id: row.id as string,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    ai_category: row.ai_category as string | null,
    created_at: row.created_at as string
  }));

  const canonicalId = pickCanonicalDuplicate(
    { reportId, latitude, longitude, aiCategory, radiusDeg: radius },
    candidates
  );

  const { error: updateError } = await supabase
    .from("reports")
    .update({
      possible_duplicate_of: canonicalId,
      dup_checked_at: new Date().toISOString()
    })
    .eq("id", reportId);

  if (updateError) {
    throw new Error(`Failed to flag possible duplicate: ${updateError.message}`);
  }

  if (canonicalId) {
    await addReportStatusHistory({
      reportId,
      actor: "system",
      event: "possible_duplicate_detected",
      note: `Possible duplicate of report ${canonicalId} (within ${radius} deg, same category).`
    });
  }

  return canonicalId;
}

// Admin confirms a report IS a duplicate: link it to the original and mark it ignored so it
// drops off the public layer (anon RLS requires duplicate_of is null).
export async function confirmReportDuplicate({
  reportId,
  originalId
}: {
  reportId: string;
  originalId: string;
}) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("reports")
    .update({ duplicate_of: originalId, possible_duplicate_of: null })
    .eq("id", reportId);

  if (error) {
    throw new Error(`Failed to confirm duplicate: ${error.message}`);
  }

  await updateReportManualStatus({
    reportId,
    publicStatus: "ignored",
    note: `Confirmed duplicate of report ${originalId}.`
  });
}

// Admin clears the duplicate suggestion: the report is a distinct issue after all.
export async function clearReportDuplicate({ reportId }: { reportId: string }) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("reports")
    .update({ possible_duplicate_of: null, duplicate_of: null })
    .eq("id", reportId);

  if (error) {
    throw new Error(`Failed to clear duplicate flag: ${error.message}`);
  }

  await addReportStatusHistory({
    reportId,
    actor: "admin",
    event: "duplicate_cleared",
    note: "Admin marked this report as not a duplicate."
  });
}
