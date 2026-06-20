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
