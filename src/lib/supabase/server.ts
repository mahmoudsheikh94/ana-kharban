import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerKey, getSupabaseUrl } from "./config";

export function createSupabaseServerClient() {
  return createClient(getSupabaseUrl(), getSupabaseServerKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
