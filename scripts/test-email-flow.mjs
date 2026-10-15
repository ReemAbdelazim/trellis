// End-to-end test of every email the app sends, against a mock Gmail API.
//   1. npm run db:reset && npm run seed:dev
//   2. npx supabase functions serve --env-file supabase/functions/.env.test
//   3. npm run test:emails
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { adminClient, localEnv, reporter, signInWithMfa } from "./lib/helpers.mjs";

const { url: URL_ } = localEnv();
const admin = adminClient();
const { check, finish } = reporter();
const PASSWORD = "seeds-dev-2026";

// ---------------------------------------------------------------------------
// Mock Gmail: token endpoint + messages.send; decodes each MIME message.
// ---------------------------------------------------------------------------
const outbox = [];
const fromB64 = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const header = (mime, name) => {
  const raw = new RegExp(`^${name}: (.*)$`, "mi").exec(mime)?.[1] ?? "";
  return raw.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_m, b) => Buffer.from(b, "base64").toString("utf8"));
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
    outbox.push({ to: header(mime, "To"), subject: header(mime, "Subject"), html: part(mime, "text/html"), text: part(mime, "text/plain") });
    res.end(JSON.stringify({ id: `mock-${outbox.length}` }));
  });
});
await new Promise((r) => server.listen(4010, r));

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

const ids = Object.fromEntries(
  (await admin.from("profiles").select("id, email").in("email", ["jordan@seedsofleadership.ca", "sam@seedsofleadership.ca", "priya@seedsofleadership.ca"])).data.map(
    (p) => [p.email.split("@")[0], p.id],
  ),
);

// Start clean: everything read, nobody digested yet, digest windows set per person.
await admin.from("notifications").update({ read_at: new Date().toISOString(), emailed_at: new Date().toISOString() }).is("read_at", null);
await admin.from("profiles").update({ last_digest_on: null, timezone: zoneAtLocalHour(20) }).neq("id", ids.sam);
await admin.from("profiles").update({ last_digest_on: null, timezone: zoneAtLocalHour(9) }).eq("id", ids.sam);

const { client: jordan } = await signInWithMfa("jordan@seedsofleadership.ca", PASSWORD);
const { data: task } = await admin.from("tasks").select("id, name").eq("name", "Book the venue").single();

console.log("\nHourly mention emails");
await jordan.from("comments").insert({
  task_id: task.id,
  author_id: ids.jordan,
  body: `@[Sam Rivera](${ids.sam}) @[Priya Patel](${ids.priya}) can you two check the quotes?`,
  mentions: [ids.sam, ids.priya],
});
let result = await tick("mentions");
const mentionMails = outbox.filter((m) => /mentioned/i.test(m.subject));
check("run succeeded", result.ok, result);
check("each mentioned person gets one email", mentionMails.length === 2, outbox.map((m) => `${m.to}: ${m.subject}`));
check("email names the task and quotes the comment", mentionMails.length === 2 && mentionMails.every((m) => m.html.includes("Book the venue") && m.html.includes("can you two check")));
check("email links straight to the task", mentionMails.length === 2 && mentionMails.every((m) => m.html.includes(`task=${task.id}`)));
check("mention markup is shown as plain names", mentionMails.length === 2 && mentionMails.every((m) => !m.html.includes("](")));
check("plain-text version is included", mentionMails.every((m) => m.text.includes("Book the venue")));

console.log("\nMorning digest");
await tick("digests");
const digests = outbox.filter((m) => /Good morning/.test(m.subject));
check("person whose local time is 9am gets a digest", digests.some((m) => m.to === "sam@seedsofleadership.ca"), digests.map((m) => m.to));
check("person whose local time is 8pm does not", !digests.some((m) => m.to === "priya@seedsofleadership.ca"));
check("digest lists the unread item", digests[0]?.html.includes("Book the venue"));

console.log("\nNo repeats");
const before = outbox.length;
await tick("mentions");
await tick("digests");
check("next runs send nothing new", outbox.length === before, outbox.slice(before).map((m) => m.subject));
await jordan.from("comments").insert({ task_id: task.id, author_id: ids.jordan, body: "plain comment, no mention", mentions: [] });
await tick("mentions");
check("comments without mentions don't trigger hourly emails", outbox.length === before);

console.log("\nAccount emails (Supabase Auth hook)");
// Signed like Supabase does (Standard Webhooks), with the secret from .env.test.
const hookSecret = /SEND_EMAIL_HOOK_SECRET=v1,whsec_(.+)/.exec(
  readFileSync(new URL("../supabase/functions/.env.test", import.meta.url), "utf8"),
)[1].trim();
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
    redirect_to: "http://localhost:3000/auth/callback/?next=%2Fauth%2Freset",
    email_action_type: "recovery",
  },
};
check("unsigned hook calls are rejected", (await callHook(resetPayload, false)) === 401);
const hookBefore = outbox.length;
check("signed reset request is accepted", (await callHook(resetPayload)) === 200);
const resetMail = outbox[hookBefore];
check("reset email is sent to the account", resetMail?.to === "sam@seedsofleadership.ca" && /reset/i.test(resetMail.subject), resetMail?.subject);
check(
  "reset link goes to the app with a one-time token",
  !!resetMail?.html.includes("http://localhost:3000/auth/callback/?next=%2Fauth%2Freset&amp;token_hash=abc123hash&amp;type=recovery"),
  resetMail?.html.match(/href="([^"]+)"/)?.[1],
);

server.close();
await admin.from("profiles").update({ timezone: null, last_digest_on: null }).neq("id", "00000000-0000-0000-0000-000000000000");
finish();
