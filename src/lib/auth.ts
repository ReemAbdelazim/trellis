"use client";

import { createClient } from "@/lib/supabase/client";
import { absoluteUrl, routes } from "@/lib/routes";

export type OAuthProvider = "google" | "azure";

/** Only same-site, absolute-path redirects are honoured (no open redirects). */
export function safeNext(next: string | null | undefined, fallback: string = routes.home) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

export async function signInWithProvider(provider: OAuthProvider, next: string) {
  const redirectTo = absoluteUrl(`/auth/callback?next=${encodeURIComponent(safeNext(next))}`);
  return createClient().auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      scopes: provider === "azure" ? "openid email profile offline_access" : undefined,
      queryParams: { prompt: "select_account" },
    },
  });
}

/** Signs out locally and sends the browser to the login page (full reload clears all caches). */
export async function signOut() {
  await createClient().auth.signOut({ scope: "local" });
  window.location.assign(absoluteUrl(routes.login));
}
