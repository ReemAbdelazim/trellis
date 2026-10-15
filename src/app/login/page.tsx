import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/shell/logo";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-full items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={44} />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Seeds Tasks</h1>
          <p className="mt-1 text-sm text-muted">Plan, track, and grow the work at Seeds of Leadership.</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-faint">
          Use your Seeds email. Guests use the address they were invited with. Every account uses two-factor sign-in.
        </p>
      </div>
    </main>
  );
}
