"use server";

import { completePermit, transitionPermit } from "@/lib/supabase/permits";
import { revalidatePath } from "next/cache";

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

  await completePermit({ permitId, note: note || null });

  revalidatePath(`/permits/${permitId}`);
  revalidatePath("/permits");
  revalidatePath("/dashboard");
  revalidatePath("/map");
}
