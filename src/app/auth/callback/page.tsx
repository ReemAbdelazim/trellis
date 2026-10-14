"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth";
import { routes } from "@/lib/routes";
import { PageLoader } from "@/components/ui/misc";

/** Finishes Google/Microsoft sign-in: trades the one-time code for a session. */
function Callback() {
  const params = useSearchParams();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the code can only be exchanged once
    started.current = true;

    const fail = (message: string) =>
      router.replace(`${routes.login}?error_description=${encodeURIComponent(message)}`);

    const providerError = params.get("error_description") ?? params.get("error");
    if (providerError) return fail(providerError);

    const code = params.get("code");
    if (!code) return fail("Sign-in link is missing its code. Please try again.");

    createClient()
      .auth.exchangeCodeForSession(code)
      .then(({ error }) => (error ? fail(error.message) : router.replace(safeNext(params.get("next")))));
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
