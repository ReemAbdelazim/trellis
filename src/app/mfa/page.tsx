"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { safeNext, signOut } from "@/lib/auth";
import { routes } from "@/lib/routes";
import { qk } from "@/lib/queries/keys";
import { Logo } from "@/components/shell/logo";
import { PageLoader } from "@/components/ui/misc";
import { MfaChallenge, MfaEnroll } from "@/components/auth/mfa";

type State = { kind: "loading" } | { kind: "challenge"; factorId: string } | { kind: "enroll" };

/** Two-factor step after sign-in: set up an authenticator (first time) or enter its code. */
function MfaStep() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const next = safeNext(params.get("next"));
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    (async () => {
      const auth = createClient().auth;
      // getUser() checks with the server, so a stale or removed session goes back to sign-in.
      const { data, error } = await auth.getUser();
      if (error || !data.user) {
        await auth.signOut({ scope: "local" });
        return router.replace(`${routes.login}?next=${encodeURIComponent(next)}`);
      }
      const factor = data.user.factors?.find((f) => f.factor_type === "totp" && f.status === "verified");
      setState(factor ? { kind: "challenge", factorId: factor.id } : { kind: "enroll" });
    })();
  }, [next, router]);

  const done = () => {
    // Drop the cached "needs two-factor" answer so the app gate re-checks the upgraded session.
    qc.removeQueries({ queryKey: qk.me });
    router.replace(next);
  };

  return (
    <main className="flex min-h-full items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={40} />
          <h1 className="mt-4 text-xl font-semibold">
            {state.kind === "enroll" ? "Set up two-factor sign-in" : "Two-factor verification"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {state.kind === "enroll"
              ? "Trellis requires an authenticator app for every account. It takes about a minute."
              : "Enter the code from your authenticator app to continue."}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          {state.kind === "loading" && <PageLoader />}
          {state.kind === "challenge" && <MfaChallenge factorId={state.factorId} onDone={done} />}
          {state.kind === "enroll" && <MfaEnroll onDone={done} />}
        </div>
        <p className="mt-6 text-center text-xs text-faint">
          Lost your phone? An admin can reset it.{" "}
          <button onClick={() => signOut()} className="text-accent hover:underline">
            Sign out
          </button>
        </p>
      </div>
    </main>
  );
}

export default function MfaPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <MfaStep />
    </Suspense>
  );
}
