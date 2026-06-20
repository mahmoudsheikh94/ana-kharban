export function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  return url;
}

export function getSupabasePublishableKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  return key;
}

export function getSupabaseServerKey() {
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!key) {
    throw new Error("Missing SUPABASE_SECRET_KEY for server-side dashboard reads");
  }

  return key;
}

export function getStorageBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET || "report-images";
}

export function getTelegramBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  return token;
}

export function getTelegramWebhookSecret() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("Missing TELEGRAM_WEBHOOK_SECRET");
  }

  return secret;
}

export function getGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  return key;
}
