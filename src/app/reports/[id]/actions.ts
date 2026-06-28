"use server";

import { updateReportManualStatus } from "@/lib/supabase/ingestion";
import { clearReportDuplicate, confirmReportDuplicate } from "@/lib/supabase/reports";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const validationStatuses = new Set(["approved", "rejected", "needs_more_info", "pending"]);
const publicStatuses = new Set(["new", "sent", "acknowledged", "fixed", "ignored"]);

const uuid = z.string().uuid();

function revalidateReport(reportId: string) {
  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath("/map");
}

export async function updateReportStatusAction(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "");
  const validationStatus = String(formData.get("validationStatus") ?? "");
  const publicStatus = String(formData.get("publicStatus") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!reportId) {
    throw new Error("Missing report ID");
  }

  await updateReportManualStatus({
    reportId,
    validationStatus: validationStatuses.has(validationStatus) ? validationStatus : undefined,
    publicStatus: publicStatuses.has(publicStatus) ? publicStatus : undefined,
    note: note || null
  });

  revalidateReport(reportId);
}

// Admin confirms the flagged report is a duplicate of `originalId` -> link + ignore + hide.
export async function confirmDuplicateAction(formData: FormData) {
  const reportId = uuid.parse(String(formData.get("reportId") ?? ""));
  const originalId = uuid.parse(String(formData.get("originalId") ?? ""));

  await confirmReportDuplicate({ reportId, originalId });
  revalidateReport(reportId);
}

// Admin dismisses the duplicate suggestion: this is a distinct issue.
export async function clearDuplicateAction(formData: FormData) {
  const reportId = uuid.parse(String(formData.get("reportId") ?? ""));

  await clearReportDuplicate({ reportId });
  revalidateReport(reportId);
}
