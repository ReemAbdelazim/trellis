"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage, PASSWORD_RULES } from "@/lib/auth";
import { routes } from "@/lib/routes";
import { Logo } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PageLoader, Spinner } from "@/components/ui/misc";
import { MfaChallenge } from "@/components/auth/mfa";

type Step = { kind: "loading" } | { kind: "mfa"; factorId: string } | { kind: "password" };

/** Reached from a reset-password email (via /auth/callback): choose a new password. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    (async () => {
      const auth = createClient().auth;
      const { data } = await auth.getSession();
      if (!data.session) {
        return router.replace(`${routes.login}?error_description=${encodeURIComponent("That reset link has expired. Please request a new one.")}`);
      }
      // People with two-factor confirm it before changing their password.
      const { data: aal } = await auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        const { data: factors } = await auth.mfa.listFactors();
        const factor = factors?.totp.find((f) => f.status === "verified");
        if (factor) return setStep({ kind: "mfa", factorId: factor.id });
      }
      setStep({ kind: "password" });
    })();
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("The passwords don't match.");
    setPending(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    setPending(false);
    if (error) return setError(authErrorMessage(error.message));
    toast.success("Password updated");
    router.replace(routes.home);
  };

  return (
    <main className="flex min-h-full items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={40} />
          <h1 className="mt-4 text-xl font-semibold">Choose a new password</h1>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          {step.kind === "loading" && <PageLoader />}
          {step.kind === "mfa" && <MfaChallenge factorId={step.factorId} onDone={() => setStep({ kind: "password" })} />}
          {step.kind === "password" && (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                />
                <p className="mt-1 text-xs text-faint">{PASSWORD_RULES}</p>
              </div>
              <div>
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-[13px] text-danger">{error}</p>}
              <Button type="submit" variant="primary" size="md" className="w-full justify-center" disabled={pending}>
                {pending && <Spinner size={16} className="text-current" />}
                Save new password
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
