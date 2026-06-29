"use server";

import { completePermit, transitionPermit } from "@/lib/supabase/permits";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type TransitionTarget = "approved" | "active" | "rejected" | "cancelled";

const transitionTargets = new Set<TransitionTarget>(["approved", "active", "rejected", "cancelled"]);

export async function transitionPermitAction(formData: FormData) {
  const permitId = String(formData.get("permitId") ?? "");
  const to = String(formData.get("to") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!permitId) {
    throw new Error("Missing permit ID");
  }

  if (!transitionTargets.has(to as TransitionTarget)) {
    throw new Error("Invalid permit transition target");
  }

  await transitionPermit({ permitId, to: to as TransitionTarget, note: note || null });

  revalidatePath(`/permits/${permitId}`);
  revalidatePath("/permits");
}

export async function completePermitAction(formData: FormData) {
  const permitId = String(formData.get("permitId") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!permitId) {
    throw new Error("Missing permit ID");
  }

  try {
    await completePermit({ permitId, note: note || null });
  } catch (error) {
    if (error instanceof Error && error.message === "PERMIT_NO_FIX_SUBMISSION") {
      // Can't complete without proof — send the admin back with an inline notice.
      redirect(`/permits/${permitId}?error=no_fix`);
    }
    throw error;
  }

  revalidatePath(`/permits/${permitId}`);
  revalidatePath("/permits");
  revalidatePath("/dashboard");
  revalidatePath("/map");
}
