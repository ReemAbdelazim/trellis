// Integration tests for the Edge Functions (invite, admin, files, notifications).
// Needs the local stack with the functions runtime and seeded data:
//   npm run db:start && npm run db:reset && npm run seed:dev && npm run test:functions
import { adminClient, anonClient, localEnv, reporter, signInWithMfa } from "./lib/helpers.mjs";

const { url: URL_, publishableKey: PUB } = localEnv();
const admin = adminClient();
const { check, finish } = reporter();
const PASSWORD = "seeds-dev-2026";
const run = Date.now().toString(36);

/** Seeded user signed in with two-factor completed. */
const as = (email) => signInWithMfa(email, PASSWORD);

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

const { data: tempMfa } = await admin.auth.admin.createUser({ email: `mfa-${run}@seedsofleadership.ca`, password: PASSWORD, email_confirm: true });
await signInWithMfa(`mfa-${run}@seedsofleadership.ca`, PASSWORD);
r = await call("admin", aya.token, { action: "reset-mfa", userId: tempMfa.user.id });
const { data: leftFactors } = await admin.auth.admin.mfa.listFactors({ userId: tempMfa.user.id });
check("admin resets someone's two-factor", r.status === 200 && leftFactors.factors.length === 0, r);
r = await call("admin", jordan.token, { action: "reset-mfa", userId: guest.id });
check("members can't reset two-factor", r.status === 403, r);

console.log("\ntwo-factor");
const passwordOnly = anonClient();
const { data: aal1 } = await passwordOnly.auth.signInWithPassword({ email: "sam@seedsofleadership.ca", password: PASSWORD });
r = await call("invite", aal1.session.access_token, { email: `x2-${run}@partner.org` });
check("functions refuse sessions without two-factor", r.status === 403, r);

console.log("\nfiles");
const { data: anyTask } = await admin.from("tasks").select("id").eq("name", "Book the venue").single();
r = await call("files", jordan.token, { action: "upload-url", taskId: anyTask.id, fileName: "a.pdf", size: 1000 });
check("without R2 configured, uploads use Supabase Storage", r.status === 200 && r.body?.backend === "supabase", r);

console.log("\nnotifications");
r = await call("notifications", null, {});
check("rejects calls without the cron secret", r.status === 401, r);
r = await call("notifications", null, {}, { "x-cron-secret": "guess" });
check("rejects a wrong cron secret", r.status === 401, r);
await admin.rpc("configure_notifications", { p_url: `${URL_}/functions/v1/notifications`, p_secret: `test-${run}` });
r = await call("notifications", null, { job: "activity" }, { "x-cron-secret": `test-${run}` });
check("accepts the configured secret", r.status === 200 && r.body?.ok, r);

finish();
