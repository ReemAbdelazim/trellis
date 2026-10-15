// POST /functions/v1/notifications  { job: "mentions" | "digests" }
// Called by pg_cron (no user JWT; it authenticates with the shared secret stored
// by the admin "Connect email" step).
//
// mentions (hourly):         one email per person @mentioned since the last run.
// digests (every 15 minutes): between 08:00 and 11:59 in each person's time zone,
//                             once a day, one email listing what's still unread.
//
// Each run sends at most MAX_EMAILS_PER_RUN so it stays inside the function time
// limit and Gmail's sending rate; anything left is picked up by the next run.
import { HttpError, json, readJson, safeEqual, serve } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { appUrl, emailEnabled, emailLayout, escapeHtml, sendEmail } from "../_shared/email.ts";
import {
  describeNotification,
  notificationExcerpt,
  notificationHref,
  segmentsToText,
  type NotificationLike,
} from "../_shared/notification-text.ts";

const DIGEST_START_HOUR = 8;
const DIGEST_END_HOUR = 12;
const MAX_ITEMS_PER_EMAIL = 25;
const MAX_EMAILS_PER_RUN = 100;

type Row = NotificationLike & { id: string; user_id: string; created_at: string };
type Person = { id: string; email: string; full_name: string; timezone: string | null; last_digest_on: string | null };
type Svc = ReturnType<typeof serviceClient>;

serve(async (req) => {
  const svc = serviceClient();
  const { data: cfg } = await svc.rpc("notification_delivery_status");
  const secret = (cfg as { secret?: string } | null)?.secret;
  if (!secret || !safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) throw new HttpError(401, "Unauthorized");
  if (!emailEnabled()) return json({ ok: true, skipped: "email not configured" });

  const { job } = await readJson<{ job?: string }>(req);
  if (job === "mentions") return json({ ok: true, mentions: await sendMentionEmails(svc) });
  if (job === "digests") return json({ ok: true, digests: await sendMorningDigests(svc) });
  throw new HttpError(400, "Unknown job");
});

/** People who want email, keyed by id. */
async function loadPeople(svc: Svc, ids: string[]) {
  if (!ids.length) return new Map<string, Person>();
  const { data } = await svc
    .from("profiles")
    .select("id, email, full_name, timezone, last_digest_on")
    .in("id", ids)
    .eq("status", "active")
    .eq("email_notifications", true);
  return new Map((data ?? []).map((p) => [p.id, p as Person]));
}

/** Names for the tasks, projects, goals and actors referenced by notifications. */
async function loadNames(svc: Svc, rows: Row[]) {
  const ids = (key: keyof Row) => [...new Set(rows.map((r) => r[key]).filter(Boolean) as string[])];
  const [tasks, projects, goals, actors] = await Promise.all([
    ids("task_id").length ? svc.from("tasks").select("id, name").in("id", ids("task_id")) : { data: [] },
    ids("project_id").length ? svc.from("projects").select("id, name").in("id", ids("project_id")) : { data: [] },
    ids("goal_id").length ? svc.from("goals").select("id, name").in("id", ids("goal_id")) : { data: [] },
    ids("actor_id").length ? svc.from("profiles").select("id, full_name").in("id", ids("actor_id")) : { data: [] },
  ]);
  const map = (list: { id: string; name?: string; full_name?: string }[] | null) =>
    new Map((list ?? []).map((x) => [x.id, x.name ?? x.full_name ?? ""]));
  return { tasks: map(tasks.data), projects: map(projects.data), goals: map(goals.data), actors: map(actors.data) };
}

function renderItems(rows: Row[], names: Awaited<ReturnType<typeof loadNames>>) {
  const shown = rows.slice(0, MAX_ITEMS_PER_EMAIL);
  const items = shown.map((n) => {
    const segments = describeNotification(n, {
      actorName: n.actor_id ? names.actors.get(n.actor_id) : null,
      taskName: n.task_id ? names.tasks.get(n.task_id) : null,
      projectName: n.project_id ? names.projects.get(n.project_id) : null,
      goalName: n.goal_id ? names.goals.get(n.goal_id) : null,
    });
    const excerpt = notificationExcerpt(n);
    const url = appUrl(notificationHref(n));
    const sentence = segments.map((s) => (s.strong ? `<b>${escapeHtml(s.text)}</b>` : escapeHtml(s.text))).join("");
    return {
      html: `<li style="margin:0 0 12px"><a href="${escapeHtml(url)}" style="color:#1e2420;text-decoration:none">${sentence}</a>${
        excerpt ? `<div style="color:#5f6a62;margin-top:2px">“${escapeHtml(excerpt)}”</div>` : ""
      }</li>`,
      text: `- ${segmentsToText(segments)}${excerpt ? ` — "${excerpt}"` : ""}\n  ${url}`,
    };
  });
  const more = rows.length - shown.length;
  return {
    html: `<ul style="padding-left:18px;margin:12px 0 0">${items.map((i) => i.html).join("")}</ul>${
      more > 0 ? `<p style="color:#5f6a62">…and ${more} more in your Inbox.</p>` : ""
    }`,
    text: items.map((i) => i.text).join("\n") + (more > 0 ? `\n…and ${more} more in your Inbox.` : ""),
  };
}

async function sendMentionEmails(svc: Svc) {
  const since = new Date(Date.now() - 26 * 3600_000).toISOString();
  // Claim rows first (emailed_at) so overlapping runs can never double-send.
  const { data: claimed } = await svc
    .from("notifications")
    .update({ emailed_at: new Date().toISOString() })
    .eq("type", "mentioned")
    .is("emailed_at", null)
    .is("read_at", null)
    .is("archived_at", null)
    .gt("created_at", since)
    .select("id, user_id, type, data, actor_id, task_id, project_id, goal_id, created_at");
  const rows = (claimed ?? []) as Row[];
  if (!rows.length) return { sent: 0 };

  const recipients = [...new Set(rows.map((r) => r.user_id))];
  // Over the per-run cap: hand the rest back for the next run.
  const later = recipients.slice(MAX_EMAILS_PER_RUN);
  if (later.length) {
    await svc
      .from("notifications")
      .update({ emailed_at: null })
      .in("id", rows.filter((r) => later.includes(r.user_id)).map((r) => r.id));
  }

  const people = await loadPeople(svc, recipients.slice(0, MAX_EMAILS_PER_RUN));
  const names = await loadNames(svc, rows);
  let sent = 0;
  for (const [userId, person] of people) {
    const mine = rows.filter((r) => r.user_id === userId);
    const body = renderItems(mine, names);
    const subject = mine.length === 1 ? "You were mentioned in Seeds Tasks" : `You were mentioned ${mine.length} times in Seeds Tasks`;
    const ok = await sendEmail({
      to: person.email,
      subject,
      html: emailLayout(subject, body.html, { label: "Open your Inbox", url: appUrl("/inbox") }),
      text: `${subject}\n\n${body.text}`,
    });
    if (ok) sent++;
    else {
      // Release so the next hourly run retries.
      await svc.from("notifications").update({ emailed_at: null }).in("id", mine.map((r) => r.id));
    }
  }
  return { sent };
}

function localParts(timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function safeTimeZone(tz: string | null | undefined, fallback: string) {
  try {
    if (tz) {
      new Intl.DateTimeFormat("en-CA", { timeZone: tz });
      return tz;
    }
  } catch {
    /* invalid zone: fall back */
  }
  return fallback;
}

async function sendMorningDigests(svc: Svc) {
  const { data: org } = await svc.from("org_settings").select("timezone").eq("id", 1).single();
  const orgTz = safeTimeZone(org?.timezone, "America/Toronto");

  const { data: everyone } = await svc
    .from("profiles")
    .select("id, email, full_name, timezone, last_digest_on")
    .eq("status", "active")
    .eq("email_notifications", true);

  let sent = 0;
  let checked = 0;
  for (const person of (everyone ?? []) as Person[]) {
    if (checked >= MAX_EMAILS_PER_RUN) break; // the next 15-minute run continues
    const { date, hour } = localParts(safeTimeZone(person.timezone, orgTz));
    if (hour < DIGEST_START_HOUR || hour >= DIGEST_END_HOUR) continue;
    if (person.last_digest_on && person.last_digest_on >= date) continue;

    // Mark first: at most one digest per person per day, even if sending fails.
    checked++;
    await svc.from("profiles").update({ last_digest_on: date }).eq("id", person.id);

    const { data: unread } = await svc
      .from("notifications")
      .select("id, user_id, type, data, actor_id, task_id, project_id, goal_id, created_at")
      .eq("user_id", person.id)
      .is("read_at", null)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    const rows = (unread ?? []) as Row[];
    if (!rows.length) continue;

    const names = await loadNames(svc, rows);
    const body = renderItems(rows, names);
    const first = person.full_name.split(" ")[0] || "there";
    const subject = `Good morning ${first} — ${rows.length} unread in your Seeds Tasks Inbox`;
    const ok = await sendEmail({
      to: person.email,
      subject,
      html: emailLayout(`You have ${rows.length} unread ${rows.length === 1 ? "update" : "updates"}`, body.html, {
        label: "Open your Inbox",
        url: appUrl("/inbox"),
      }),
      text: `${subject}\n\n${body.text}`,
    });
    if (ok) sent++;
  }
  return { sent };
}
