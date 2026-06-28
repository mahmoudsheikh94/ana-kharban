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

// Optional: powers the public map's "volunteer to fix" Telegram deep link. Returns null
// when unset so the CTA is simply hidden rather than crashing the public page.
export function getTelegramBotUsername(): string | null {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return username ? username : null;
}

export function getGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  return key;
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function getAbuseLimits() {
  return {
    userDailyAiLimit: readPositiveIntegerEnv("AI_DAILY_USER_LIMIT", 3),
    globalDailyAiLimit: readPositiveIntegerEnv("AI_DAILY_GLOBAL_LIMIT", 100),
    userWeeklyReportLimit: readPositiveIntegerEnv("REPORTS_WEEKLY_USER_LIMIT", 10),
    maxInvalidAttempts: readPositiveIntegerEnv("TELEGRAM_MAX_INVALID_ATTEMPTS", 3),
    maxImageBytes: readPositiveIntegerEnv("TELEGRAM_MAX_IMAGE_BYTES", 6 * 1024 * 1024)
  };
}
