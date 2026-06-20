export const adminCookieName = "ana_kharban_admin";

function getAdminPassword() {
  const password = process.env.ADMIN_DASHBOARD_PASSWORD;

  if (!password) {
    throw new Error("Missing ADMIN_DASHBOARD_PASSWORD");
  }

  return password;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function getExpectedAdminCookie() {
  return sha256(`ana-kharban-admin:${getAdminPassword()}`);
}

export async function isValidAdminCookie(value: string | undefined) {
  if (!value) {
    return false;
  }

  return value === (await getExpectedAdminCookie());
}
