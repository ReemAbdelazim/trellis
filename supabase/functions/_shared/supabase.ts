import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { HttpError } from "./http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface Caller {
  /** Client acting as the caller: every query is subject to RLS. */
  db: SupabaseClient;
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "member" | "guest";
}

/** Service-role client. Bypasses RLS: only use after authorising the caller. */
export function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Resolves the signed-in, active caller from the request's bearer token. */
export async function requireCaller(req: Request): Promise<Caller> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "Sign in required");

  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(authorization.slice("Bearer ".length));
  if (error || !data.user) throw new HttpError(401, "Sign in required");

  const { data: profile } = await db
    .from("profiles")
    .select("id, email, full_name, role, status")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || profile.status !== "active") throw new HttpError(403, "Your account doesn't have access");

  return { db, id: profile.id, email: profile.email, fullName: profile.full_name, role: profile.role };
}

export async function requireAdmin(req: Request) {
  const caller = await requireCaller(req);
  if (caller.role !== "admin") throw new HttpError(403, "Admins only");
  return caller;
}

export { SUPABASE_URL };
