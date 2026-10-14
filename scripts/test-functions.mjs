// Integration tests for the Edge Functions (invite, admin, notifications).
// Needs the local stack with the functions runtime and seeded data:
//   npm run db:start && npm run db:reset && npm run seed:dev && npm run test:functions
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
if (!URL_.includes("127.0.0.1") && !URL_.includes("localhost")) throw new Error("Refusing to run against a non-local project");
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(URL_, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PASSWORD = "seeds-dev-password";
const run = Date.now().toString(36);

let passes = 0;
let failures = 0;
const check = (name, cond, extra) => {
  if (cond) {
    passes++;
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}`, extra ?? "");
  }
};

async function as(email) {
  const c = createClient(URL_, PUB, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message} (run npm run seed:dev first)`);
  return { c, token: data.session.access_token, id: data.user.id };
}

async function call(name, token, body, headers = {}) {
  const res = await fetch(`${URL_}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: PUB, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const aya = await as("aya@seedsofleadership.ca"); // admin
const jordan = await as("jordan@seedsofleadership.ca"); // member
const guest = await as("guest@partner.org");
const { data: partner } = await admin.from("projects").select("id").eq("name", "Partner Grant Report").single();
const { data: retreat } = await admin.from("projects").select("id").eq("name", "Spring Leadership Retreat").single();

console.log("\ninvite");
let r = await call("invite", jordan.token, { email: `friend-${run}@partner.org`, projectId: retreat.id });
check("member invites a guest to a project they edit", r.status === 200 && r.body?.ok, r);
r = await call("invite", jordan.token, { email: `boss-${run}@partner.org`, role: "admin" });
check("member can't invite an admin", r.status === 403, r);
r = await call("invite", jordan.token, { email: `sneak-${run}@partner.org`, projectId: partner.id });
check("member can't invite into a private project they're not in", r.status === 404 || r.status === 403, r);
r = await call("invite", guest.token, { email: `pal-${run}@partner.org` });
check("guests can't invite", r.status === 403, r);
r = await call("invite", jordan.token, { email: "not-an-email" });
check("rejects invalid email", r.status === 400, r);
r = await call("invite", null, { email: `x-${run}@partner.org` });
check("requires sign-in", r.status === 401, r);

console.log("\nadmin");
r = await call("admin", aya.token, { action: "email-status" });
check("admin reads email status", r.status === 200 && typeof r.body?.emailConfigured === "boolean", r);
check("…without exposing secrets", !JSON.stringify(r.body).includes("secret"), r.body);
r = await call("admin", jordan.token, { action: "email-status" });
check("members can't use admin actions", r.status === 403, r);
r = await call("admin", aya.token, { action: "remove-user", userId: aya.id });
check("admins can't remove themselves", r.status === 400, r);
const { data: temp } = await admin.auth.admin.createUser({ email: `temp-${run}@seedsofleadership.ca`, password: PASSWORD, email_confirm: true });
r = await call("admin", aya.token, { action: "remove-user", userId: temp.user.id });
check("admin removes a user", r.status === 200, r);
r = await call("admin", jordan.token, { action: "remove-user", userId: guest.id });
check("members can't remove users", r.status === 403, r);

console.log("\nnotifications");
r = await call("notifications", null, {});
check("rejects calls without the cron secret", r.status === 401, r);
r = await call("notifications", null, {}, { "x-cron-secret": "guess" });
check("rejects a wrong cron secret", r.status === 401, r);
await admin.rpc("configure_notifications", { p_url: `${URL_}/functions/v1/notifications`, p_secret: `test-${run}` });
r = await call("notifications", null, {}, { "x-cron-secret": `test-${run}` });
check("accepts the configured secret", r.status === 200 && r.body?.ok, r);

console.log(`\n${passes} passed, ${failures} failed\n`);
process.exit(failures ? 1 : 0);
