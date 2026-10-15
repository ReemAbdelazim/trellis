import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

let client: ReturnType<typeof createSupabaseClient<Database>> | undefined;

/**
 * The single browser client. The app is fully static, so the session lives in
 * localStorage and OAuth uses PKCE; /auth/callback exchanges the code itself.
 */
export function createClient() {
  client ??= createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "seeds-tasks-auth",
    },
  });
  return client;
}

