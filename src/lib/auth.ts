"use client";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";
import { absoluteUrl, routes } from "@/lib/routes";

export type OAuthProvider = "google" | "azure";

export const PASSWORD_RULES = "At least 10 characters, with letters and numbers.";

/** Only same-site, absolute-path redirects are honoured (no open redirects). */
export function safeNext(next: string | null | undefined, fallback: string = routes.home) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

const callbackUrl = (next: string) => absoluteUrl(`/auth/callback/?next=${encodeURIComponent(safeNext(next))}`);

/**
 * Account emails (confirm, reset) must work when opened on another device, so
 * they're requested with the implicit flow: the link carries a one-time token
 * instead of depending on a code verifier stored in this browser.
 */
function emailFlowClient() {
  return createSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function signInWithProvider(provider: OAuthProvider, next: string) {
  return createClient().auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl(next),
      scopes: provider === "azure" ? "openid email profile offline_access" : undefined,
      queryParams: { prompt: "select_account" },
    },
  });
}

export function signInWithPassword(email: string, password: string) {
  return createClient().auth.signInWithPassword({ email: email.trim(), password });
}

export function signUpWithPassword(input: { email: string; password: string; fullName: string; next: string }) {
  return emailFlowClient().auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { emailRedirectTo: callbackUrl(input.next), data: { full_name: input.fullName.trim() } },
  });
}

export function requestPasswordReset(email: string) {
  return emailFlowClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: callbackUrl("/auth/reset") });
}

/** Signs out locally and sends the browser to the login page (full reload clears all caches). */
export async function signOut() {
  await createClient().auth.signOut({ scope: "local" });
  window.location.assign(absoluteUrl(routes.login));
}

/** Turns Supabase Auth / sign-up gate errors into messages people can act on. */
export function authErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/SEEDS_NOT_AUTHORIZED|Database error (saving|creating) new user/i.test(raw)) {
    return "That account isn't part of this workspace yet. Use your work email, or ask an admin to invite you as a guest.";
  }
  if (/invalid login credentials/i.test(raw)) return "That email and password don't match.";
  if (/email not confirmed/i.test(raw)) return "Confirm your email first: we sent you a link when you created the account.";
  if (/password should|weak password/i.test(raw)) return `Choose a stronger password. ${PASSWORD_RULES}`;
  if (/rate limit|too many|security purposes/i.test(raw)) return "Too many attempts. Please wait a minute and try again.";
  if (/code verifier|both auth code and code verifier/i.test(raw)) {
    return "That sign-in link was opened in a different browser. Please start again here.";
  }
  if (/expired|invalid.*(token|otp)/i.test(raw)) return "That link has expired or was already used. Please request a new one.";
  return raw;
}
