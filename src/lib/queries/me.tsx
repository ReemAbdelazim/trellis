"use client";

import { createContext, useContext, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { routes } from "@/lib/routes";
import { PageLoader } from "@/components/ui/misc";
import { qk } from "./keys";
import type { Profile } from "@/types/models";

type SessionState =
  | { status: "signed-out" }
  | { status: "needs-mfa" }
  | { status: "no-access" }
  | { status: "ok"; profile: Profile };

async function loadSession(): Promise<SessionState> {
  const supabase = createClient();
  // getUser() validates the token with the server, so a removed account is caught.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "signed-out" };
  }
  // Every account uses two-factor; the database refuses data to sessions without it.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") return { status: "needs-mfa" };
  const { data: profile, error: pErr } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (pErr) throw pErr;
  if (!profile || profile.status !== "active") return { status: "no-access" };
  return { status: "ok", profile };
}

const MeContext = createContext<Profile | null>(null);

/**
 * Gate for every signed-in page: resolves the session, two-factor state and
 * profile, redirects to /login, /mfa or /no-access, and provides the profile.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: qk.me,
    queryFn: loadSession,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    const { data: sub } = createClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        qc.clear();
        router.replace(routes.login);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [qc, router]);

  useEffect(() => {
    if (isFetching) return; // act on a fresh answer, not a cached one being re-checked
    if (data?.status === "signed-out") {
      const next = `${pathname}${window.location.search}`;
      router.replace(`${routes.login}?next=${encodeURIComponent(next)}`);
    } else if (data?.status === "needs-mfa") {
      const next = `${pathname}${window.location.search}`;
      router.replace(`${routes.mfa}?next=${encodeURIComponent(next)}`);
    } else if (data?.status === "no-access") {
      router.replace("/no-access");
    }
  }, [data, isFetching, pathname, router]);

  if (isError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-medium">Couldn&apos;t reach Seeds Tasks.</p>
        <button onClick={() => refetch()} className="text-sm font-medium text-accent hover:underline">
          Try again
        </button>
      </div>
    );
  }
  if (data?.status !== "ok") return <div className="h-dvh"><PageLoader /></div>;
  return <MeContext.Provider value={data.profile}>{children}</MeContext.Provider>;
}

export function useMe(): Profile {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used inside the authenticated app");
  return me;
}

export function useIsAdmin() {
  return useMe().role === "admin";
}

export function useIsGuest() {
  return useMe().role === "guest";
}
