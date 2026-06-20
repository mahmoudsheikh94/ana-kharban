import { loadLocalEnv } from "./env.mjs";

loadLocalEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
const baseUrl = process.env.APP_BASE_URL;

if (!token || !secretToken || !baseUrl) {
  console.error("Missing TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, or APP_BASE_URL.");
  process.exit(1);
}

const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/telegram/webhook`;
const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ["message"]
  })
});
const payload = await response.json();

if (!response.ok || !payload.ok) {
  console.error(payload.description ?? "Failed to set Telegram webhook.");
  process.exit(1);
}

console.log(`Telegram webhook configured for ${webhookUrl}`);
