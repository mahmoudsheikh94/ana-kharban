import { loadLocalEnv } from "./env.mjs";

loadLocalEnv();

const baseUrl = (process.env.APP_BASE_URL ?? "https://ana-kharban.vercel.app").replace(/\/$/, "");
const adminPassword = process.env.ADMIN_DASHBOARD_PASSWORD;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

if (!adminPassword) {
  console.error("Missing ADMIN_DASHBOARD_PASSWORD.");
  process.exit(1);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function expectStatus(label, url, expected, init = {}) {
  const response = await fetch(url, { redirect: "manual", ...init });
  if (response.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, received ${response.status}`);
  }
  console.log(`ok - ${label}`);
  return response;
}

await expectStatus("login page is public", `${baseUrl}/login`, 200);

const dashboardRedirect = await expectStatus("dashboard requires admin cookie", `${baseUrl}/dashboard`, 307);
const location = dashboardRedirect.headers.get("location") ?? "";
if (!location.includes("/login")) {
  throw new Error(`dashboard redirect target should include /login, received ${location}`);
}

const adminCookie = await sha256(`ana-kharban-admin:${adminPassword}`);
await expectStatus("dashboard accepts admin cookie", `${baseUrl}/dashboard`, 200, {
  headers: {
    cookie: `ana_kharban_admin=${adminCookie}`
  }
});

await expectStatus("abuse dashboard accepts admin cookie", `${baseUrl}/abuse`, 200, {
  headers: {
    cookie: `ana_kharban_admin=${adminCookie}`
  }
});

await expectStatus("telegram webhook rejects missing secret", `${baseUrl}/api/telegram/webhook`, 401, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ update_id: 1 })
});

await expectStatus("telegram webhook health endpoint responds", `${baseUrl}/api/telegram/webhook`, 200);

if (telegramToken) {
  const response = await fetch(`https://api.telegram.org/bot${telegramToken}/getWebhookInfo`);
  const payload = await response.json();

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? "Telegram getWebhookInfo failed.");
  }

  const expectedWebhookUrl = `${baseUrl}/api/telegram/webhook`;
  if (payload.result.url !== expectedWebhookUrl) {
    throw new Error(`Telegram webhook URL mismatch. Expected ${expectedWebhookUrl}, received ${payload.result.url}`);
  }

  console.log("ok - telegram webhook points to production app");
} else {
  console.log("skip - TELEGRAM_BOT_TOKEN is not set");
}
