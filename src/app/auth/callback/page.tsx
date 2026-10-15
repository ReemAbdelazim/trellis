"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, safeNext } from "@/lib/auth";
import { routes } from "@/lib/routes";
import { PageLoader } from "@/components/ui/misc";

/**
 * Where every sign-in link lands:
 *  - `?code=`        Google (PKCE)
 *  - `?token_hash=`  confirm-email and reset-password links sent by our auth-email hook
 *  - `#access_token` the same links from Supabase's default mailer (local development)
 */
function Callback() {
  const params = useSearchParams();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // links work once
    started.current = true;

    const supabase = createClient();
    const next = safeNext(params.get("next"));
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const fail = (message: string) =>
      router.replace(`${routes.login}?error_description=${encodeURIComponent(authErrorMessage(message) ?? message)}`);

    const providerError =
      params.get("error_description") ?? params.get("error") ?? hash.get("error_description") ?? hash.get("error");
    if (providerError) return fail(providerError);

    const finish = ({ error }: { error: { message: string } | null }) => (error ? fail(error.message) : router.replace(next));

    const code = params.get("code");
    const tokenHash = params.get("token_hash");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    if (code) supabase.auth.exchangeCodeForSession(code).then(finish);
    else if (tokenHash) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: (params.get("type") ?? "email") as EmailOtpType }).then(finish);
    } else if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(finish);
    } else fail("That sign-in link is incomplete. Please try again.");
  }, [params, router]);

  return <PageLoader />;
}

export default function AuthCallbackPage() {
  return (
    <div className="h-dvh">
      <Suspense fallback={<PageLoader />}>
        <Callback />
      </Suspense>
    </div>
  );
}
