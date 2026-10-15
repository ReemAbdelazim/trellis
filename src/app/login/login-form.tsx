"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/queries/keys";
import {
  authErrorMessage,
  PASSWORD_RULES,
  requestPasswordReset,
  safeNext,
  signInWithPassword,
  signInWithGoogle,
  signUpWithPassword,
} from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";

type Mode = "signin" | "signup" | "forgot";

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

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>("signin");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(authErrorMessage(params.get("error_description") ?? params.get("error")));
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  // Already signed in? Skip the login screen.
  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace(next);
      });
  }, [next, router]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  const run = async (key: string, action: () => Promise<{ error: { message: string } | null }>, onOk: () => void) => {
    setPending(key);
    setError(null);
    setNotice(null);
    const { error } = await action();
    setPending(null);
    if (error) setError(authErrorMessage(error.message));
    else onOk();
  };

  const google = () =>
    run("google", () => signInWithGoogle(next), () => {
      /* the browser is redirected to Google */
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signin") {
      run("password", () => signInWithPassword(email, password), () => {
        qc.removeQueries({ queryKey: qk.me });
        router.replace(next);
      });
    } else if (mode === "signup") {
      run("password", () => signUpWithPassword({ email, password, fullName, next }), () =>
        setNotice("Check your email for a link to confirm your address, then sign in."),
      );
    } else {
      run("password", () => requestPasswordReset(email), () =>
        setNotice("If there's an account for that email, we've sent a link to reset the password."),
      );
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="rounded-md bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-md bg-success-soft px-3 py-2.5 text-[13px] text-success">
          {notice}
        </div>
      )}

      {mode === "signin" && (
        <>
          <Button size="md" className="w-full justify-center" disabled={!!pending} onClick={google}>
            {pending === "google" ? <Spinner size={16} /> : <GoogleIcon />}
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 py-1 text-xs text-faint">
            <span className="h-px flex-1 bg-border" /> or use email <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form onSubmit={submit} className="space-y-3">
        {mode === "signup" && (
          <div>
            <Label htmlFor="full-name">Your name</Label>
            <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
          </div>
        )}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        {mode !== "forgot" && (
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {mode === "signin" && (
                <button type="button" onClick={() => switchMode("forgot")} className="mb-1 text-xs text-accent hover:underline">
                  Forgot password?
                </button>
              )}
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 10 : undefined}
              required
            />
            {mode === "signup" && <p className="mt-1 text-xs text-faint">{PASSWORD_RULES}</p>}
          </div>
        )}
        <Button type="submit" variant="primary" size="md" className="w-full justify-center" disabled={!!pending}>
          {pending === "password" && <Spinner size={16} className="text-current" />}
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Email me a reset link"}
        </Button>
      </form>

      <p className="text-center text-[13px] text-muted">
        {mode === "signin" ? (
          <>
            New here?{" "}
            <button type="button" onClick={() => switchMode("signup")} className="font-medium text-accent hover:underline">
              Create an account
            </button>
          </>
        ) : (
          <button type="button" onClick={() => switchMode("signin")} className="font-medium text-accent hover:underline">
            Back to sign in
          </button>
        )}
      </p>
    </div>
  );
}
