"use server";

import { blockTelegramUser, unblockTelegramUser } from "@/lib/supabase/ingestion";
import { revalidatePath } from "next/cache";

export async function blockUserAction(formData: FormData) {
  const telegramUserId = String(formData.get("telegramUserId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || "Blocked by admin from abuse dashboard.";

  if (!telegramUserId) {
    return;
  }

  await blockTelegramUser({ telegramUserId, reason });
  revalidatePath("/abuse");
}

export async function unblockUserAction(formData: FormData) {
  const telegramUserId = String(formData.get("telegramUserId") ?? "").trim();

  if (!telegramUserId) {
    return;
  }

  await unblockTelegramUser(telegramUserId);
  revalidatePath("/abuse");
}
