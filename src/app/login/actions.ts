"use server";

import { adminCookieName, getExpectedAdminCookie } from "@/lib/auth/admin";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  if (password !== process.env.ADMIN_DASHBOARD_PASSWORD) {
    redirect("/login?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set(adminCookieName, await getExpectedAdminCookie(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });

  redirect("/dashboard");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(adminCookieName);
  redirect("/login");
}
