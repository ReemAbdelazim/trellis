// End-to-end test of every email the app sends, against a mock Gmail API.
//   1. npm run db:reset && npm run seed:dev
//   2. npx supabase functions serve --env-file supabase/functions/.env.test
//   3. npm run test:emails
// Set EMAIL_DUMP_DIR to also save each email as an .html file for a visual check.
//
// Besides content, it checks that every link in every email opens a real page
// for a record that exists, and that emails about one task share a thread.
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { adminClient, localEnv, reporter, signInWithMfa } from "./lib/helpers.mjs";

const { url: URL_ } = localEnv();
const admin = adminClient();
const { check, finish } = reporter();
const PASSWORD = "seeds-dev-2026";
const testEnv = readFileSync(new URL("../supabase/functions/.env.test", import.meta.url), "utf8");
const APP_URL = /^APP_URL=(.+)$/m.exec(testEnv)[1].trim().replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Mock Gmail: token endpoint + messages.send; decodes each MIME message.
// ---------------------------------------------------------------------------
const outbox = [];
const fromB64 = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const header = (mime, name) => {
  const head = mime.slice(0, mime.indexOf("\r\n\r\n"));
  const raw = new RegExp(`^${name}: (.*)$`, "mi").exec(head)?.[1] ?? "";
  return raw.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_m, b) => Buffer.from(b, "base64").toString("utf8")).trim();
};
const part = (mime, type) => {
  const m = new RegExp(`Content-Type: ${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`).exec(mime);
  return m ? Buffer.from(m[1].replace(/\s+/g, ""), "base64").toString("utf8") : "";
};

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.url === "/token") return res.end(JSON.stringify({ access_token: "mock-token", expires_in: 3600 }));
    const mime = fromB64(JSON.parse(body).raw);
    outbox.push({
      to: header(mime, "To"),
      subject: header(mime, "Subject"),
      messageId: header(mime, "Message-ID"),
      inReplyTo: header(mime, "In-Reply-To"),
      references: header(mime, "References"),
      html: part(mime, "text/html"),
      text: part(mime, "text/plain"),
    });
    res.end(JSON.stringify({ id: `mock-${outbox.length}` }));
  });
});
await new Promise((r) => server.listen(4010, r));

/** Emails sent while `fn` runs. */
async function capture(fn) {
  const start = outbox.length;
  await fn();
  return outbox.slice(start);
}

/** An IANA zone whose local hour is currently `hour`. */
function zoneAtLocalHour(hour) {
  let offset = (hour - new Date().getUTCHours() + 24) % 24;
  if (offset > 14) offset -= 24;
  return offset === 0 ? "Etc/UTC" : offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

const cronSecret = `email-test-${Date.now()}`;
await admin.rpc("configure_notifications", { p_url: `${URL_}/functions/v1/notifications`, p_secret: cronSecret });
const tick = async (job) => {
  const res = await fetch(`${URL_}/functions/v1/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
    body: JSON.stringify({ job }),
  });
  return res.json();
};

// ---------------------------------------------------------------------------
// Link checker: each href must be an app page for records that exist.
// ---------------------------------------------------------------------------
const PAGES = new Set(["home", "my-tasks", "inbox", "projects", "settings", "project", "search", "login", "auth/callback"]);
const exists = async (table, id) => !!(await admin.from(table).select("id").eq("id", id).maybeSingle()).data;

async function linkProblem(href) {
  if (!href.startsWith(`${APP_URL}/`)) return "not an app link";
  const u = new URL(href);
  const page = u.pathname.slice(APP_URL.length - u.origin.length).replace(/^\/|\/$/g, "");
  if (u.pathname !== "/" && !u.pathname.endsWith("/") && !/\.(png|svg)$/.test(u.pathname)) return "missing trailing slash";
  if (/\.(png|svg)$/.test(page)) return existsSync(new URL(`../public/${page}`, import.meta.url)) ? null : "missing asset";
  if (!PAGES.has(page)) return `unknown page /${page}`;
  const dir = page === "login" || page.startsWith("auth/") ? `../src/app/${page}/page.tsx` : `../src/app/(app)/${page}/page.tsx`;
  if (!existsSync(new URL(dir, import.meta.url))) return `no page file for /${page}`;
  const p = u.searchParams;
  if (page === "project") {
    if (!(await exists("projects", p.get("id")))) return "project does not exist";
    if (p.get("task")) {
      const { data } = await admin.from("tasks").select("project_id").eq("id", p.get("task")).maybeSingle();
      if (data?.project_id !== p.get("id")) return "task is not in that project";
    }
  }
  if (page === "my-tasks" && p.get("task") && !(await exists("tasks", p.get("task")))) return "task does not exist";
  if (page === "search" && p.get("assignee") && !(await exists("profiles", p.get("assignee")))) return "person does not exist";
  if (page === "login" && p.get("next")) return linkProblem(`${APP_URL}${p.get("next")}`);
  return null;
}

const hrefs = (m) => [...m.html.matchAll(/(?:href|src)="([^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, "&"));

async function checkLinks(label, mails) {
  const problems = [];
  for (const m of mails) for (const h of hrefs(m)) {
    const why = await linkProblem(h);
    if (why) problems.push(`${m.subject} → ${h}: ${why}`);
  }
  check(`${label}: every link opens a real page`, mails.length > 0 && problems.length === 0, problems);
}

const linksTo = (m, path) => hrefs(m).includes(`${APP_URL}${path}`);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const ids = Object.fromEntries(
  (await admin.from("profiles").select("id, email").like("email", "%@seedsofleadership.ca")).data.map((p) => [p.email.split("@")[0], p.id]),
);
const { data: task } = await admin.from("tasks").select("id, name, project_id, projects(name)").eq("name", "Book the venue").single();
const subjectFor = `"${task.name}" in ${task.projects.name}`;
const taskLink = `/project/?id=${task.project_id}&view=list&task=${task.id}`;

// Start clean: nothing pending, nobody has had today's update, everyone outside the daily window.
await admin.from("notifications").update({ read_at: new Date().toISOString(), emailed_at: new Date().toISOString() }).is("emailed_at", null);
await admin.from("profiles").update({ last_digest_on: null, timezone: zoneAtLocalHour(20), email_prefs: {} }).neq("id", ids.sam);
// Sam is in the daily window, but already had today's update until that section runs.
const samToday = new Intl.DateTimeFormat("en-CA", { timeZone: zoneAtLocalHour(9) }).format(new Date());
await admin.from("profiles").update({ last_digest_on: samToday, timezone: zoneAtLocalHour(9), email_prefs: {} }).eq("id", ids.sam);

const { client: jordan } = await signInWithMfa("jordan@seedsofleadership.ca", PASSWORD);
const { client: sam } = await signInWithMfa("sam@seedsofleadership.ca", PASSWORD);

// ---------------------------------------------------------------------------
console.log("\nTask activity (hourly)");
// ---------------------------------------------------------------------------
await jordan.from("comments").insert({
  task_id: task.id,
  author_id: ids.jordan,
  body: `@[Sam Rivera](${ids.sam}) @[Priya Patel](${ids.priya}) can you two check the quotes?`,
  mentions: [ids.sam, ids.priya],
});
await jordan.from("tasks").update({ assignee_id: ids.sam }).eq("id", task.id);
let result;
const first = await capture(async () => (result = await tick("activity")));
const toSam = first.filter((m) => m.to === "sam@seedsofleadership.ca");
const toPriya = first.filter((m) => m.to === "priya@seedsofleadership.ca");
check("run succeeded", result.ok, result);
check("a mention plus an assignment is one email, not two", toSam.length === 1, first.map((m) => `${m.to}: ${m.subject}`));
check("each mentioned person gets one email", toPriya.length === 1);
check("subject names the task and project", toSam[0]?.subject === subjectFor, toSam[0]?.subject);
check("email lists both updates", !!toSam[0]?.html.includes("mentioned you") && toSam[0].html.includes("assigned you this task"));
check("email quotes the comment with plain names", !!toSam[0]?.html.includes("can you two check") && !toSam[0].html.includes("]("));
check("View task button opens the task", !!toSam[0] && linksTo(toSam[0], taskLink));
check("task card links the project", !!toSam[0] && linksTo(toSam[0], `/project/?id=${task.project_id}`));
check("people link to their tasks", !!toSam[0] && linksTo(toSam[0], `/search/?assignee=${ids.jordan}`));
check("footer links to email settings", !!toSam[0] && linksTo(toSam[0], "/settings/"));
check("plain-text version links the task", !!toSam[0]?.text.includes(`${APP_URL}${taskLink}`));
check("email starts a thread for the task", toSam[0]?.references === `<task-${task.id}@trellis.app>` && toSam[0].inReplyTo === toSam[0].references, toSam[0]?.references);

console.log("\nThreading");
await jordan.from("comments").insert({ task_id: task.id, author_id: ids.jordan, body: "Venue B has parking.", mentions: [] });
const second = (await capture(() => tick("activity"))).filter((m) => m.to === "sam@seedsofleadership.ca");
check("a follow-up comment sends one more email", second.length === 1, second.map((m) => m.subject));
check("same subject as the first email", second[0]?.subject === toSam[0]?.subject);
check("same thread headers as the first email", second[0]?.references === toSam[0]?.references);
check("each email has its own Message-ID", !!second[0]?.messageId && second[0].messageId !== toSam[0]?.messageId);
check("recent comments include the earlier one", !!second[0]?.html.includes("Recent comments") && second[0].html.includes("can you two check"));

console.log("\nEmail preferences");
await admin.from("profiles").update({ email_prefs: { comments: false } }).eq("id", ids.sam);
await jordan.from("comments").insert({ task_id: task.id, author_id: ids.jordan, body: "Booking venue B.", mentions: [] });
const optedOut = await capture(() => tick("activity"));
check("comments switched off: no comment email", !optedOut.some((m) => m.to === "sam@seedsofleadership.ca"), optedOut.map((m) => m.to));
check("other followers still get it", optedOut.some((m) => m.to === "priya@seedsofleadership.ca"));
await jordan.from("comments").insert({ task_id: task.id, author_id: ids.jordan, body: `@[Sam Rivera](${ids.sam}) final check?`, mentions: [ids.sam] });
const mentionStill = await capture(() => tick("activity"));
check("mentions still arrive with comments off", mentionStill.some((m) => m.to === "sam@seedsofleadership.ca"));
await admin.from("profiles").update({ email_prefs: {} }).eq("id", ids.sam);

await sam.from("comments").insert({ task_id: task.id, author_id: ids.sam, body: "Read already", mentions: [] });
await admin.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ids.priya).is("read_at", null);
const readFirst = await capture(() => tick("activity"));
check("items already read in the app are not emailed", !readFirst.some((m) => m.to === "priya@seedsofleadership.ca"), readFirst.map((m) => m.to));

await checkLinks("task activity", [...first, ...second, ...optedOut, ...mentionStill]);

// ---------------------------------------------------------------------------
console.log("\nFirst access and accepted invites");
// ---------------------------------------------------------------------------
const stamp = Date.now();
const newbieEmail = `newbie${stamp}@seedsofleadership.ca`;
const partnerEmail = `partner${stamp}@example.org`;
await admin.from("invitations").insert({ email: partnerEmail, role: "guest", invited_by: ids.jordan, project_id: task.project_id });
const created = [];
for (const [email, full_name] of [[newbieEmail, "Nora Newbie"], [partnerEmail, "Pat Partner"]]) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name } });
  if (error) throw error;
  created.push(data.user.id);
}
const account = await capture(() => tick("frequent"));
const welcome = account.find((m) => m.to === newbieEmail);
const welcomeGuest = account.find((m) => m.to === partnerEmail);
const accepted = account.find((m) => m.to === "jordan@seedsofleadership.ca");
check("new member gets a welcome email", welcome?.subject === "Welcome to Trellis", account.map((m) => `${m.to}: ${m.subject}`));
check("invited guest gets a welcome email listing their project", !!welcomeGuest?.html.includes(task.projects.name) && linksTo(welcomeGuest, `/project/?id=${task.project_id}`));
check("welcome links to My tasks and Inbox", !!welcome && linksTo(welcome, "/my-tasks/") && linksTo(welcome, "/inbox/"));
check("inviter hears the invite was accepted", accepted?.subject === "Pat Partner accepted your invite to Trellis", accepted?.subject);
check("accepted email lists the shared project", !!accepted && linksTo(accepted, `/project/?id=${task.project_id}`));
check("accepted email links to the new person", !!accepted && linksTo(accepted, `/search/?assignee=${created[1]}`));
await checkLinks("account emails", account);

// ---------------------------------------------------------------------------
console.log("\nDaily update");
// ---------------------------------------------------------------------------
await admin.from("profiles").update({ last_digest_on: null }).eq("id", ids.sam);
const { data: dueTask } = await admin.from("tasks").select("id, name, project_id").eq("name", "Registration form").single();
await admin.from("tasks").update({ due_date: samToday, completed: false, assignee_id: ids.sam }).eq("id", dueTask.id);
const daily = await capture(() => tick("frequent"));
const samDaily = daily.find((m) => m.to === "sam@seedsofleadership.ca");
check("person whose local time is 9am gets the daily update", !!samDaily, daily.map((m) => m.to));
check("person whose local time is 8pm does not", !daily.some((m) => m.to === "priya@seedsofleadership.ca"));
check("subject has the weekday and due-soon count", /^\w+day - tasks due soon: \d+/.test(samDaily?.subject ?? ""), samDaily?.subject);
check("each task row opens that task", !!samDaily && linksTo(samDaily, `/project/?id=${dueTask.project_id}&view=list&task=${dueTask.id}`));
check("View in Trellis opens My tasks", !!samDaily && linksTo(samDaily, "/my-tasks/"));
await checkLinks("daily update", daily);

await admin.from("profiles").update({ last_digest_on: null, email_prefs: { daily: false } }).eq("id", ids.sam);
const noDaily = await capture(() => tick("frequent"));
check("daily update switched off: none sent", !noDaily.some((m) => m.to === "sam@seedsofleadership.ca"));
await admin.from("profiles").update({ email_prefs: {}, last_digest_on: samToday }).eq("id", ids.sam);

console.log("\nNo repeats");
const repeats = await capture(async () => {
  await tick("activity");
  await tick("frequent");
});
check("next runs send nothing new", repeats.length === 0, repeats.map((m) => `${m.to}: ${m.subject}`));

// ---------------------------------------------------------------------------
console.log("\nAuth emails (Supabase Auth hook)");
// ---------------------------------------------------------------------------
// Signed like Supabase does (Standard Webhooks), with the secret from .env.test.
const hookSecret = /SEND_EMAIL_HOOK_SECRET=v1,whsec_(.+)/.exec(testEnv)[1].trim();
const callHook = async (payload, sign = true) => {
  const body = JSON.stringify(payload);
  const id = `msg_${randomUUID()}`;
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac("sha256", Buffer.from(hookSecret, "base64")).update(`${id}.${ts}.${body}`).digest("base64");
  const res = await fetch(`${URL_}/functions/v1/auth-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": sign ? `v1,${sig}` : "v1,bad" },
    body,
  });
  return res.status;
};
const resetPayload = {
  user: { email: "sam@seedsofleadership.ca" },
  email_data: {
    token: "123456",
    token_hash: "abc123hash",
    token_hash_new: "",
    redirect_to: `${APP_URL}/auth/callback/?next=%2Fauth%2Freset`,
    email_action_type: "recovery",
  },
};
check("unsigned hook calls are rejected", (await callHook(resetPayload, false)) === 401);
let status;
const [resetMail] = await capture(async () => (status = await callHook(resetPayload)));
check("signed reset request is accepted", status === 200);
check("reset email is sent to the account", resetMail?.to === "sam@seedsofleadership.ca" && /reset/i.test(resetMail.subject), resetMail?.subject);
check(
  "reset link goes to the app with a one-time token",
  !!resetMail && linksTo(resetMail, "/auth/callback/?next=%2Fauth%2Freset&token_hash=abc123hash&type=recovery"),
  resetMail && hrefs(resetMail),
);
await checkLinks("auth emails", resetMail ? [resetMail] : []);

// ---------------------------------------------------------------------------
server.close();
if (process.env.EMAIL_DUMP_DIR) {
  mkdirSync(process.env.EMAIL_DUMP_DIR, { recursive: true });
  outbox.forEach((m, i) => writeFileSync(join(process.env.EMAIL_DUMP_DIR, `${String(i + 1).padStart(2, "0")}-${m.to.split("@")[0]}.html`), m.html));
  console.log(`
Saved ${outbox.length} emails to ${process.env.EMAIL_DUMP_DIR}`);
}
for (const id of created) await admin.auth.admin.deleteUser(id);
await admin.from("invitations").delete().eq("email", partnerEmail);
await admin.from("profiles").update({ timezone: null, last_digest_on: null, email_prefs: {} }).neq("id", "00000000-0000-0000-0000-000000000000");
finish();
