import { loadLocalEnv } from "./env.mjs";

loadLocalEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN.");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
const payload = await response.json();

if (!response.ok || !payload.ok) {
  console.error(payload.description ?? "Failed to call getMe.");
  process.exit(1);
}

console.log(`Bot verified: @${payload.result.username} (${payload.result.first_name})`);
