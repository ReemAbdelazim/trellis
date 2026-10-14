"use client";

import { Logo } from "@/components/shell/logo";
import { signOut } from "@/lib/auth";

export default function NoAccessPage() {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="max-w-sm text-center">
        <div className="flex justify-center">
          <Logo size={40} />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Your account doesn&apos;t have access</h1>
        <p className="mt-2 text-sm text-muted">
          This account has been deactivated or hasn&apos;t been set up in the Seeds workspace. If you think this is a
          mistake, contact a Seeds admin.
        </p>
        <button onClick={() => signOut()} className="mt-6 text-sm font-medium text-accent hover:underline">
          Sign in with a different account
        </button>
      </div>
    </main>
  );
}
