"use server";

import { updateReportManualStatus } from "@/lib/supabase/ingestion";
import { revalidatePath } from "next/cache";

const validationStatuses = new Set(["approved", "rejected", "needs_more_info", "pending"]);
const publicStatuses = new Set(["new", "sent", "acknowledged", "fixed", "ignored"]);

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

  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath("/map");
}
