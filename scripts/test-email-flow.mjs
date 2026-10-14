// End-to-end test of notification emails with a mock email provider.
//   1. npm run seed:dev
//   2. npx supabase functions serve --env-file supabase/functions/.env.test   (see README)
//   3. npm run test:emails
import { createClient } from "@supabase/supabase-js";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
if (!URL_.includes("127.0.0.1") && !URL_.includes("localhost")) throw new Error("Refusing to run against a non-local project");
const admin = createClient(URL_, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PASSWORD = "seeds-dev-password";

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

// Mock Resend: records every email it is asked to send.
const outbox = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    outbox.push(JSON.parse(body));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: `mock-${outbox.length}` }));
  });
});
await new Promise((r) => server.listen(4010, r));

/** An IANA zone whose local hour is currently `hour`. */
function zoneAtLocalHour(hour) {
  let offset = (hour - new Date().getUTCHours() + 24) % 24; // hours ahead of UTC
  if (offset > 14) offset -= 24;
  return offset === 0 ? "Etc/UTC" : offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

const secret = `email-test-${Date.now()}`;
await admin.rpc("configure_notifications", { p_url: `${URL_}/functions/v1/notifications`, p_secret: secret });
const tick = async () => {
  const res = await fetch(`${URL_}/functions/v1/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": secret },
    body: "{}",
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

const jordan = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
await jordan.auth.signInWithPassword({ email: "jordan@seedsofleadership.ca", password: PASSWORD });
const { data: task } = await admin.from("tasks").select("id, name").eq("name", "Book the venue").single();

console.log("\nHourly mention emails");
await jordan.from("comments").insert({
  task_id: task.id,
  author_id: ids.jordan,
  body: `@[Sam Rivera](${ids.sam}) @[Priya Patel](${ids.priya}) can you two check the quotes?`,
  mentions: [ids.sam, ids.priya],
});
let result = await tick();
const mentionMails = outbox.filter((m) => /mentioned/i.test(m.subject));
check("tick succeeded", result.ok, result);
check("each mentioned person gets one email", mentionMails.length === 2, outbox.map((m) => `${m.to}: ${m.subject}`));
check("email names the task and quotes the comment", mentionMails.every((m) => m.html.includes("Book the venue") && m.html.includes("can you two check")));
check("email links straight to the task", mentionMails.every((m) => m.html.includes(`task=${task.id}`)));
check("mention markup is shown as plain names", mentionMails.every((m) => !m.html.includes("](")), mentionMails[0]?.html);

console.log("\nMorning digest");
const digests = outbox.filter((m) => /Good morning/.test(m.subject));
check("person whose local time is 9am gets a digest", digests.some((m) => m.to === "sam@seedsofleadership.ca"), digests.map((m) => m.to));
check("person whose local time is 8pm does not", !digests.some((m) => m.to === "priya@seedsofleadership.ca"));
check("digest lists the unread item", digests[0]?.html.includes("Book the venue"));

console.log("\nNo repeats");
const before = outbox.length;
result = await tick();
check("next run sends nothing new", outbox.length === before, outbox.slice(before).map((m) => m.subject));

await jordan.from("comments").insert({ task_id: task.id, author_id: ids.jordan, body: "plain comment, no mention", mentions: [] });
await tick();
check("comments without mentions don't trigger hourly emails", outbox.length === before, outbox.slice(before).map((m) => m.subject));

server.close();
await admin.from("profiles").update({ timezone: null, last_digest_on: null }).neq("id", "00000000-0000-0000-0000-000000000000");
console.log(`\n${passes} passed, ${failures} failed\n`);
process.exit(failures ? 1 : 0);
