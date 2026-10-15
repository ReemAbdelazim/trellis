"use client";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Calls a Supabase Edge Function (supabase/functions/<name>) as the signed-in
 * user and surfaces its `{ error }` message on failure.
 */
export async function callFunction<T>(name: "invite" | "admin" | "files", body: Record<string, unknown>): Promise<T> {
  const { data, error } = await createClient().functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? "Something went wrong");
    }
    throw new Error("Couldn't reach Seeds Tasks. Check your connection and try again.");
  }
  return data as T;
}

export function sendInvitation(input: { email: string; role: "admin" | "member" | "guest"; projectId: string | null }) {
  return callFunction<{ ok: true; emailed: boolean }>("invite", input);
}
