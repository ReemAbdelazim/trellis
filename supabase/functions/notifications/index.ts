// POST /functions/v1/notifications  { job: "activity" | "frequent" }
// Called by pg_cron (no user JWT; it authenticates with the shared secret stored
// by the admin "Connect email" step).
//
// activity (hourly):   one email per task with new comments, assignments and
//                      @mentions, threaded per task in each person's inbox.
// frequent (15 min):   welcome and invite-accepted emails, plus the daily update
//                      (08:00–11:59 in each person's time zone, once a day).
//
// Each run sends at most MAX_EMAILS_PER_RUN so it stays inside the function time
// limit and Gmail's sending rate; anything left is picked up by the next run.
import { HttpError, json, readJson, safeEqual, serve } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { appUrl, emailEnabled, sendEmail } from "../_shared/email.ts";
import {
  dailyUpdateEmail,
  inviteAcceptedEmail,
  taskActivityEmail,
  welcomeEmail,
  type BuiltEmail,
  type CommentSummary,
  type DigestTask,
  type Person,
  type TaskEvent,
  type TaskEventKind,
} from "../_shared/email-templates.ts";

const MAX_EMAILS_PER_RUN = 100;
const DAILY_START_HOUR = 8;
const DAILY_END_HOUR = 12;

type Svc = ReturnType<typeof serviceClient>;
type Org = { name: string; timeZone: string };
/** Per-kind email switches in profiles.email_prefs; a missing key means on. */
type Pref = "daily" | "comments" | "assigned" | "mentions" | "invites";

interface Recipient {
  id: string;
  email: string;
  full_name: string;
  timezone: string | null;
  last_digest_on: string | null;
  email_notifications: boolean;
  email_prefs: Record<string, boolean> | null;
}

interface NotificationRow {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  task_id: string | null;
  project_id: string | null;
  comment_id: string | null;
  created_at: string;
}

const RECIPIENT_COLUMNS = "id, email, full_name, timezone, last_digest_on, email_notifications, email_prefs";

const TASK_EVENTS: Record<string, Pref> = { commented: "comments", mentioned: "mentions", assigned: "assigned" };

serve(async (req) => {
  const svc = serviceClient();
  const { data: cfg } = await svc.rpc("notification_delivery_status");
  const secret = (cfg as { secret?: string } | null)?.secret;
  if (!secret || !safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) throw new HttpError(401, "Unauthorized");
  if (!emailEnabled()) return json({ ok: true, skipped: "email not configured" });

  const { job } = await readJson<{ job?: string }>(req);
  const org = await loadOrg(svc);
  if (job === "activity") return json({ ok: true, activity: await sendTaskActivity(svc, org) });
  if (job === "frequent") {
    const account = await sendAccountEmails(svc, org);
    const daily = await sendDailyUpdates(svc, org);
    return json({ ok: true, account, daily });
  }
  throw new HttpError(400, "Unknown job");
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
async function loadOrg(svc: Svc): Promise<Org> {
  const { data } = await svc.from("org_settings").select("name, timezone").eq("id", 1).single();
  return { name: data?.name ?? "", timeZone: safeTimeZone(data?.timezone, "America/Toronto") };
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

const wants = (r: Recipient, pref: Pref) => r.email_notifications && r.email_prefs?.[pref] !== false;
const firstName = (r: Recipient) => r.full_name.split(" ")[0] || "there";
const ctxFor = (r: Recipient, org: Org) => ({ appUrl, timeZone: safeTimeZone(r.timezone, org.timeZone) });

async function loadRecipients(svc: Svc, ids: string[]) {
  if (!ids.length) return new Map<string, Recipient>();
  const { data } = await svc.from("profiles").select(RECIPIENT_COLUMNS).in("id", [...new Set(ids)]).eq("status", "active");
  return new Map(((data ?? []) as Recipient[]).map((p) => [p.id, p]));
}

async function loadPeople(svc: Svc, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return new Map<string, Person>();
  const { data } = await svc.from("profiles").select("id, full_name, email").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id, { id: p.id, name: p.full_name || p.email }]));
}

/**
 * Claims unsent notifications (sets emailed_at) so overlapping runs never
 * double-send. Task activity skips anything already read in the app.
 */
async function claim(svc: Svc, types: string[], maxAgeHours: number, unreadOnly: boolean) {
  let q = svc
    .from("notifications")
    .update({ emailed_at: new Date().toISOString() })
    .in("type", types)
    .is("emailed_at", null)
    .gt("created_at", new Date(Date.now() - maxAgeHours * 3600_000).toISOString());
  if (unreadOnly) q = q.is("read_at", null).is("archived_at", null);
  const { data } = await q.select("id, user_id, actor_id, type, task_id, project_id, comment_id, created_at");
  return (data ?? []) as NotificationRow[];
}

/** Hands claimed rows back so the next run retries them. */
async function release(svc: Svc, rows: NotificationRow[]) {
  if (rows.length) await svc.from("notifications").update({ emailed_at: null }).in("id", rows.map((r) => r.id));
}

async function deliver(svc: Svc, to: string, email: BuiltEmail, rows: NotificationRow[]) {
  if (await sendEmail({ to, ...email })) return 1;
  await release(svc, rows);
  return 0;
}

// ---------------------------------------------------------------------------
// Task activity: one threaded email per (person, task)
// ---------------------------------------------------------------------------
async function sendTaskActivity(svc: Svc, org: Org) {
  const rows = await claim(svc, Object.keys(TASK_EVENTS), 26, true);
  const groups = new Map<string, NotificationRow[]>();
  for (const r of rows) {
    if (!r.task_id) continue;
    const key = `${r.user_id}|${r.task_id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const all = [...groups.values()];
  await release(svc, all.slice(MAX_EMAILS_PER_RUN).flat());
  const batch = all.slice(0, MAX_EMAILS_PER_RUN);
  if (!batch.length) return { sent: 0 };

  const taskIds = [...new Set(batch.map((g) => g[0].task_id!))];
  const [recipients, { data: tasks }, { data: followers }, { data: comments }] = await Promise.all([
    loadRecipients(svc, batch.map((g) => g[0].user_id)),
    svc.from("tasks").select("id, name, description, due_date, completed, project_id, assignee_id").in("id", taskIds),
    svc.from("task_followers").select("task_id, user_id").in("task_id", taskIds),
    svc
      .from("comments")
      .select("id, task_id, author_id, body, created_at")
      .in("task_id", taskIds)
      .order("created_at", { ascending: false })
      .limit(taskIds.length * 20),
  ]);
  const projectIds = [...new Set((tasks ?? []).map((t) => t.project_id).filter((id): id is string => !!id))];
  const { data: projects } = projectIds.length
    ? await svc.from("projects").select("id, name, color").in("id", projectIds)
    : { data: [] };
  const people = await loadPeople(svc, [
    ...rows.map((r) => r.actor_id),
    ...(tasks ?? []).map((t) => t.assignee_id),
    ...(followers ?? []).map((f) => f.user_id),
    ...(comments ?? []).map((c) => c.author_id),
  ]);
  const person = (id: string | null) => (id ? (people.get(id) ?? null) : null);
  const commentBody = new Map((comments ?? []).map((c) => [c.id, c.body]));

  let sent = 0;
  for (const group of batch) {
    const recipient = recipients.get(group[0].user_id);
    const task = (tasks ?? []).find((t) => t.id === group[0].task_id);
    if (!recipient || !task) continue;
    const events: TaskEvent[] = group
      .filter((n) => wants(recipient, TASK_EVENTS[n.type]))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((n) => ({
        kind: n.type as TaskEventKind,
        actor: person(n.actor_id),
        body: n.comment_id ? (commentBody.get(n.comment_id) ?? null) : null,
      }));
    if (!events.length) continue; // opted out of every kind here; stays marked as handled

    const recentComments: CommentSummary[] = (comments ?? [])
      .filter((c) => c.task_id === task.id)
      .slice(0, 3)
      .reverse()
      .map((c) => ({ author: person(c.author_id), body: c.body, createdAt: c.created_at }));
    const email = taskActivityEmail(ctxFor(recipient, org), {
      task: {
        id: task.id,
        name: task.name,
        description: task.description ?? "",
        dueDate: task.due_date,
        completed: task.completed,
        project: (projects ?? []).find((p) => p.id === task.project_id) ?? null,
        assignee: person(task.assignee_id),
        followers: (followers ?? [])
          .filter((f) => f.task_id === task.id)
          .map((f) => person(f.user_id))
          .filter((p): p is Person => !!p),
      },
      events,
      recentComments,
    });
    sent += await deliver(svc, recipient.email, email, group);
  }
  return { sent };
}

// ---------------------------------------------------------------------------
// Account emails: welcome (first access) and invite accepted
// ---------------------------------------------------------------------------
async function memberProjects(svc: Svc, userId: string) {
  const { data } = await svc
    .from("project_members")
    .select("projects!inner(id, name, color, archived, is_template)")
    .eq("user_id", userId)
    .eq("projects.archived", false)
    .eq("projects.is_template", false)
    .limit(20);
  return (data ?? []).map((r) => {
    const p = r.projects as unknown as { id: string; name: string; color: string };
    return { id: p.id, name: p.name, color: p.color };
  });
}

async function sendAccountEmails(svc: Svc, org: Org) {
  const rows = await claim(svc, ["welcome", "invite_accepted"], 24 * 7, false);
  await release(svc, rows.slice(MAX_EMAILS_PER_RUN));
  const batch = rows.slice(0, MAX_EMAILS_PER_RUN);
  if (!batch.length) return { sent: 0 };

  const [recipients, people] = await Promise.all([
    loadRecipients(svc, batch.map((r) => r.user_id)),
    loadPeople(svc, batch.map((r) => r.actor_id)),
  ]);
  let sent = 0;
  for (const n of batch) {
    const recipient = recipients.get(n.user_id);
    if (!recipient) continue;
    let email: BuiltEmail;
    if (n.type === "welcome") {
      // Account email: sent even when other notification emails are switched off.
      email = welcomeEmail(ctxFor(recipient, org), {
        firstName: firstName(recipient),
        orgName: org.name,
        projects: await memberProjects(svc, recipient.id),
      });
    } else {
      const joined = n.actor_id ? people.get(n.actor_id) : null;
      if (!joined || !wants(recipient, "invites")) continue;
      // Their projects, limited to ones shared with the inviter (or invited into).
      const mine = new Set((await memberProjects(svc, recipient.id)).map((p) => p.id));
      const theirs = (await memberProjects(svc, joined.id)).filter((p) => mine.has(p.id) || p.id === n.project_id);
      email = inviteAcceptedEmail(ctxFor(recipient, org), { person: joined, orgName: org.name, projects: theirs });
    }
    sent += await deliver(svc, recipient.email, email, [n]);
  }
  return { sent };
}

// ---------------------------------------------------------------------------
// Daily update
// ---------------------------------------------------------------------------
function localParts(timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "long",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday };
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function sendDailyUpdates(svc: Svc, org: Org) {
  const { data: everyone } = await svc
    .from("profiles")
    .select(RECIPIENT_COLUMNS)
    .eq("status", "active")
    .eq("email_notifications", true);

  let sent = 0;
  let checked = 0;
  for (const person of (everyone ?? []) as Recipient[]) {
    if (checked >= MAX_EMAILS_PER_RUN) break; // the next run continues
    if (!wants(person, "daily")) continue;
    const timeZone = safeTimeZone(person.timezone, org.timeZone);
    const { date, hour, weekday } = localParts(timeZone);
    if (hour < DAILY_START_HOUR || hour >= DAILY_END_HOUR) continue;
    if (person.last_digest_on && person.last_digest_on >= date) continue;

    // Mark first: at most one daily update per person per day, even if sending fails.
    checked++;
    await svc.from("profiles").update({ last_digest_on: date }).eq("id", person.id);

    const open = () =>
      svc
        .from("tasks")
        .select("id, name, due_date, project_id, projects(name)")
        .eq("assignee_id", person.id)
        .eq("completed", false)
        .order("due_date")
        .limit(15);
    const [{ data: dueSoon }, { data: overdue }, { count: unread }] = await Promise.all([
      open().gte("due_date", date).lte("due_date", addDays(date, 2)),
      open().lt("due_date", date),
      svc
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", person.id)
        .is("read_at", null)
        .is("archived_at", null),
    ]);
    if (!dueSoon?.length && !overdue?.length && !unread) continue;

    const toDigest = (t: NonNullable<typeof dueSoon>[number]): DigestTask => ({
      id: t.id,
      name: t.name,
      dueDate: t.due_date,
      projectId: t.project_id,
      projectName: (t.projects as unknown as { name: string } | null)?.name ?? null,
    });
    const email = dailyUpdateEmail(
      { appUrl, timeZone },
      {
        firstName: firstName(person),
        orgName: org.name,
        weekday,
        dueSoon: (dueSoon ?? []).map(toDigest),
        overdue: (overdue ?? []).map(toDigest),
        unread: unread ?? 0,
      },
    );
    if (await sendEmail({ to: person.email, ...email })) sent++;
  }
  return { sent };
}
