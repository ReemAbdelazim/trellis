"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DEV_LOGIN_ENABLED } from "@/lib/env";
import { safeNext, signInWithProvider, type OAuthProvider } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";

type Provider = OAuthProvider;

const NOT_AUTHORIZED =
  "That account isn't part of the Seeds workspace yet. Sign in with your Seeds email, or ask an admin to invite you as a guest.";

function friendlyError(raw: string | null) {
  if (!raw) return null;
  if (/SEEDS_NOT_AUTHORIZED|Database error saving new user/i.test(raw)) return NOT_AUTHORIZED;
  return raw;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const linkError = friendlyError(params.get("error_description") ?? params.get("error"));
  const [pending, setPending] = useState<Provider | "dev" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Already signed in? Skip the login screen.
  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace(next);
      });
  }, [next, router]);

  const signIn = async (provider: Provider) => {
    setPending(provider);
    setError(null);
    const { error } = await signInWithProvider(provider, next);
    if (error) {
      setError(error.message);
      setPending(null);
    }
  };

  return (
    <div className="space-y-3">
      {linkError && (
        <div role="alert" className="mb-1 rounded-md bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          {linkError}
        </div>
      )}
      <Button
        size="md"
        className="w-full justify-center"
        disabled={!!pending}
        onClick={() => signIn("google")}
      >
        {pending === "google" ? <Spinner size={16} /> : <GoogleIcon />}
        Continue with Google
      </Button>
      <Button
        size="md"
        className="w-full justify-center"
        disabled={!!pending}
        onClick={() => signIn("azure")}
      >
        {pending === "azure" ? <Spinner size={16} /> : <MicrosoftIcon />}
        Continue with Microsoft
      </Button>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {DEV_LOGIN_ENABLED && <DevLogin next={next} onDone={() => router.replace(next)} pending={pending} setPending={setPending} />}
    </div>
  );
}

/** Local development only: password sign-in for seeded test users. */
function DevLogin({
  onDone,
  pending,
  setPending,
}: {
  next: string;
  onDone: () => void;
  pending: string | null;
  setPending: (p: "dev" | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-4 space-y-2 border-t border-dashed border-border pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending("dev");
        setError(null);
        const { error } = await createClient().auth.signInWithPassword({ email, password });
        setPending(null);
        if (error) setError(error.message);
        else onDone();
      }}
    >
      <p className="text-[11px] font-semibold tracking-wide text-warning uppercase">Dev sign-in (local only)</p>
      <Input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
      <Input
        placeholder="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
      />
      <Button type="submit" variant="subtle" className="w-full justify-center" disabled={!!pending}>
        Sign in
      </Button>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </form>
  );
}
