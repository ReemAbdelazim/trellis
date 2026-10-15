// HTML + text builders for every email Trellis sends. Pure functions (no I/O),
// so they're easy to test. Every person, task, project and button links to the
// exact page in the app.

export interface Person {
  id: string;
  name: string;
}

export interface TaskSummary {
  id: string;
  name: string;
  description: string;
  dueDate: string | null;
  completed: boolean;
  project: { id: string; name: string; color: string } | null;
  assignee: Person | null;
  followers: Person[];
}

export interface CommentSummary {
  author: Person | null;
  body: string;
  createdAt: string;
}

export type TaskEventKind = "commented" | "mentioned" | "assigned";

export interface TaskEvent {
  kind: TaskEventKind;
  actor: Person | null;
  body?: string | null;
}

interface Ctx {
  /** Absolute app URL builder, e.g. path => "https://org.github.io/trellis" + path */
  url: (path: string) => string;
  timeZone: string;
}

// ---------------------------------------------------------------------------
// Links (same pages as src/lib/routes.ts). Trailing slashes match the static
// export's folders, so GitHub Pages serves them without a redirect.
// ---------------------------------------------------------------------------
export const links = {
  home: "/home/",
  myTasks: "/my-tasks/",
  inbox: "/inbox/",
  projects: "/projects/",
  settings: "/settings/",
  project: (id: string) => `/project/?id=${id}`,
  task: (taskId: string, projectId: string | null) =>
    projectId ? `/project/?id=${projectId}&view=list&task=${taskId}` : `/my-tasks/?task=${taskId}`,
  /** A person's open tasks. */
  person: (id: string) => `/search/?assignee=${id}`,
};

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const COLORS: Record<string, string> = {
  teal: "#2a9d8f", green: "#3f9c5a", lime: "#8ab83a", yellow: "#e0b522", orange: "#e9853b", red: "#d9534f",
  pink: "#e26aa5", purple: "#8e63ce", indigo: "#5c6bc0", blue: "#3a86d4", slate: "#748087",
};
const AVATAR_COLORS = Object.values(COLORS);

const TEXT = "#1e2420";
const MUTED = "#5f6a62";
const FAINT = "#8a948c";
const BORDER = "#e1e5de";
const ACCENT = "#2f7d4f";
const LINK = "#2f6fb0";

function initials(name: string) {
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function avatar(p: Person | null, size = 36) {
  const name = p?.name || "?";
  const bg = p ? avatarColor(p.id) : "#c9cfc4";
  return `<span style="display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;border-radius:50%;background:${bg};color:#fff;font-size:${Math.round(size * 0.38)}px;font-weight:bold;text-align:center;vertical-align:middle">${escapeHtml(initials(name))}</span>`;
}

function link(ctx: Ctx, path: string, text: string, style = `color:${LINK};text-decoration:none`) {
  return `<a href="${escapeHtml(ctx.url(path))}" style="${style}">${text}</a>`;
}

function button(ctx: Ctx, label: string, path: string) {
  return `<a href="${escapeHtml(ctx.url(path))}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;font-size:15px">${escapeHtml(label)}</a>`;
}

function formatDate(iso: string | null, ctx: Ctx, withTime = false) {
  if (!iso) return null;
  // Plain dates (yyyy-MM-dd) are calendar days; timestamps are shown in the reader's zone.
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  const opts: Intl.DateTimeFormatOptions = withTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: ctx.timeZone }
    : { month: "short", day: "numeric", timeZone: iso.length === 10 ? "UTC" : ctx.timeZone };
  return new Intl.DateTimeFormat("en-CA", opts).format(d).replace(/\./g, "");
}

/** User text: @[Name](id) mentions become bold names; URLs become links; line breaks kept. */
function richText(body: string) {
  const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'")\]])/g;
  return body
    .split(/(@\[[^\]]+\]\([0-9a-f-]{36}\))/g)
    .map((part) => {
      const m = /^@\[([^\]]+)\]\(([0-9a-f-]{36})\)$/.exec(part);
      if (m) return `<b>@${escapeHtml(m[1])}</b>`;
      return part
        .split(URL_RE)
        .map((chunk, i) =>
          i % 2 === 1
            ? `<a href="${escapeHtml(chunk)}" style="color:${LINK};word-break:break-all">${escapeHtml(chunk)}</a>`
            : escapeHtml(chunk),
        )
        .join("");
    })
    .join("")
    .replace(/\n/g, "<br>");
}

/** Plain-text version of user text. */
function plain(body: string) {
  return body.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, "@$1");
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
function layout(ctx: Ctx, opts: { preheader: string; body: string; footerReason: string }) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"></head>
<body style="margin:0;background:#f7f8f6;font-family:Arial,Helvetica,sans-serif;color:${TEXT}">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px">
<tr><td style="padding:24px 28px 0">
  <a href="${escapeHtml(ctx.url(links.home))}" style="text-decoration:none;color:${TEXT};display:inline-block">
    <img src="${escapeHtml(ctx.url("/trellis-mark.png"))}" alt="" height="40" style="display:block;height:40px;border:0">
    <span style="display:block;margin-top:4px;font-size:15px;font-weight:bold">Trellis</span>
  </a>
</td></tr>
<tr><td style="padding:16px 28px 28px;font-size:15px;line-height:1.55">${opts.body}</td></tr>
</table>
<p style="font-size:12px;color:${FAINT};margin:16px 0 0;max-width:600px">
  ${escapeHtml(opts.footerReason)} ${link(ctx, links.settings, "Change what Trellis sends you.", `color:${FAINT}`)}
</p>
</td></tr></table></body></html>`;
}

function headline(ctx: Ctx, actor: Person | null, text: string, sub: string | null, subPath?: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr>
${actor ? `<td style="padding-right:14px;vertical-align:middle">${link(ctx, links.person(actor.id), avatar(actor, 44), "text-decoration:none")}</td>` : ""}
<td style="vertical-align:middle"><div style="font-size:20px;line-height:1.3">${text}</div>
${sub ? `<div style="font-size:14px;color:${MUTED};margin-top:2px">${subPath ? link(ctx, subPath, escapeHtml(sub), `color:${MUTED};text-decoration:none`) : escapeHtml(sub)}</div>` : ""}</td>
</tr></table>`;
}

function taskCard(ctx: Ctx, task: TaskSummary) {
  const taskPath = links.task(task.id, task.project?.id ?? null);
  const row = (icon: string, content: string) =>
    `<tr><td style="width:28px;padding:6px 8px 6px 0;vertical-align:top;color:${MUTED}">${icon}</td><td style="padding:6px 0;font-size:14px">${content}</td></tr>`;
  const check = task.completed ? "&#10004;" : "&#9711;";
  const followers = task.followers.slice(0, 4);
  const more = task.followers.length - followers.length;
  const description = task.description.trim();
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:10px;margin-top:22px"><tr><td style="padding:16px 18px">
<div style="font-size:18px;font-weight:bold;margin-bottom:6px">${link(ctx, taskPath, `<span style="color:${task.completed ? ACCENT : MUTED}">${check}</span>&nbsp; ${escapeHtml(task.name || "Untitled task")}`, `color:${TEXT};text-decoration:none`)}</div>
<table role="presentation" cellpadding="0" cellspacing="0">
${row("&#128100;", task.assignee ? link(ctx, links.person(task.assignee.id), escapeHtml(task.assignee.name)) : `<span style="color:${MUTED}">Unassigned</span>`)}
${row("&#128197;", link(ctx, taskPath, escapeHtml(formatDate(task.dueDate, ctx) ? `Due ${formatDate(task.dueDate, ctx)}` : "No due date"), `color:${task.dueDate ? TEXT : MUTED};text-decoration:none`))}
${task.project ? row(`<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${COLORS[task.project.color] ?? COLORS.teal}"></span>`, link(ctx, links.project(task.project.id), escapeHtml(task.project.name))) : ""}
${followers.length ? row("&#128101;", followers.map((p) => link(ctx, links.person(p.id), escapeHtml(p.name))).join(", ") + (more > 0 ? ` and ${more} other${more === 1 ? "" : "s"}` : "")) : ""}
${description ? row("&#9776;", `<span style="color:${MUTED}">${richText(description.length > 280 ? `${description.slice(0, 280)}…` : description)}</span>`) : ""}
</table>
<div style="margin-top:10px">${link(ctx, taskPath, "View full task details", `color:${LINK};font-size:14px`)}</div>
</td></tr></table>`;
}

function recentComments(ctx: Ctx, task: TaskSummary, comments: CommentSummary[]) {
  if (!comments.length) return "";
  const taskPath = links.task(task.id, task.project?.id ?? null);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f1;border-radius:0 0 10px 10px;margin-top:-1px"><tr><td style="padding:14px 18px">
<div style="font-size:14px;color:${MUTED};margin-bottom:8px">Recent comments</div>
${comments
  .map(
    (c) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0"><tr>
<td style="width:34px;vertical-align:top">${c.author ? link(ctx, links.person(c.author.id), avatar(c.author, 26), "text-decoration:none") : avatar(null, 26)}</td>
<td style="vertical-align:top;font-size:14px"><div>${c.author ? link(ctx, links.person(c.author.id), `<b>${escapeHtml(c.author.name)}</b>`, `color:${TEXT};text-decoration:none`) : "<b>Someone</b>"} <span style="color:${FAINT}">&middot; ${escapeHtml(formatDate(c.createdAt, ctx, true) ?? "")}</span></div>
<div style="margin-top:3px">${richText(c.body)}</div></td>
<td style="width:28px;vertical-align:top;text-align:right">${link(ctx, taskPath, "&#128077;", "text-decoration:none;color:#8a948c")}</td>
</tr></table>`,
  )
  .join("")}
</td></tr></table>`;
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------
export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
  /** Emails about the same task share this, so mail apps thread them. */
  threadKey?: string;
}

const EVENT_TEXT: Record<TaskEventKind, (actor: string) => string> = {
  commented: (a) => `${a} added a comment`,
  mentioned: (a) => `${a} mentioned you`,
  assigned: (a) => `${a} assigned you this task`,
};

/** One email per task: new comments, @mentions and assignments since the last run. */
export function taskActivityEmail(
  ctxIn: { appUrl: (path: string) => string; timeZone: string },
  input: { task: TaskSummary; events: TaskEvent[]; recentComments: CommentSummary[] },
): BuiltEmail {
  const ctx: Ctx = { url: ctxIn.appUrl, timeZone: ctxIn.timeZone };
  const { task, events } = input;
  const taskPath = links.task(task.id, task.project?.id ?? null);
  // A mention is the most important event, then an assignment, then a comment.
  const order: TaskEventKind[] = ["mentioned", "assigned", "commented"];
  const primary = [...events].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0];
  const actorName = primary.actor?.name.split(" ")[0] ?? "Someone";
  const title = events.length > 1 ? `${events.length} updates on this task` : EVENT_TEXT[primary.kind](actorName);

  const eventList =
    events.length > 1
      ? `<ul style="padding-left:18px;margin:0 0 6px;color:${MUTED};font-size:14px">${events
          .map((e) => `<li>${escapeHtml(EVENT_TEXT[e.kind](e.actor?.name ?? "Someone"))}</li>`)
          .join("")}</ul>`
      : "";
  const quoted = events.find((e) => e.body)?.body;

  const body = `${headline(ctx, events.length > 1 ? null : primary.actor, escapeHtml(title), task.project?.name ?? null, task.project ? links.project(task.project.id) : undefined)}
${eventList}
<div style="margin:6px 0 18px">${button(ctx, "View task", taskPath)}</div>
${quoted ? `<div style="font-size:15px;margin-bottom:6px">${richText(quoted)}</div>` : ""}
${taskCard(ctx, task)}${recentComments(ctx, task, input.recentComments)}`;

  const subject = task.project ? `"${task.name || "Untitled task"}" in ${task.project.name}` : `"${task.name || "Untitled task"}"`;
  const text = [
    title,
    ...events.map((e) => `- ${EVENT_TEXT[e.kind](e.actor?.name ?? "Someone")}${e.body ? `: ${plain(e.body)}` : ""}`),
    "",
    `View task: ${ctx.url(taskPath)}`,
  ].join("\n");

  return {
    subject,
    html: layout(ctx, { preheader: quoted ? plain(quoted).slice(0, 140) : title, body, footerReason: "You're getting this because you follow this task." }),
    text,
    threadKey: `task-${task.id}`,
  };
}

export interface DigestTask {
  id: string;
  name: string;
  dueDate: string | null;
  projectId: string | null;
  projectName: string | null;
}

/** Morning update: tasks due soon, overdue, and unread inbox count. */
export function dailyUpdateEmail(
  ctxIn: { appUrl: (path: string) => string; timeZone: string },
  input: { firstName: string; orgName: string; weekday: string; dueSoon: DigestTask[]; overdue: DigestTask[]; unread: number },
): BuiltEmail {
  const ctx: Ctx = { url: ctxIn.appUrl, timeZone: ctxIn.timeZone };
  const pill = (label: string, n: number, color: string, path: string) =>
    n > 0
      ? `<td style="padding:0 6px 6px 0">${link(ctx, path, `<span style="display:inline-block;background:#f2f4f1;border-radius:8px;padding:10px 16px;color:${color};font-size:15px">${escapeHtml(label)}: <b>${n}</b></span>`, "text-decoration:none")}</td>`
      : "";
  const list = (title: string, rows: DigestTask[], dateColor: string) =>
    rows.length
      ? `<div style="font-size:17px;margin:22px 0 8px">${escapeHtml(title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:10px">
${rows
  .map(
    (t, i) => `<tr><td style="padding:14px 16px;${i ? `border-top:1px solid ${BORDER};` : ""}">
${link(ctx, links.task(t.id, t.projectId), `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="width:28px;color:${MUTED};font-size:18px">&#9711;</td>
<td style="font-size:15px;color:${TEXT}">${escapeHtml(t.name || "Untitled task")}${t.projectName ? `<div style="font-size:12px;color:${FAINT}">${escapeHtml(t.projectName)}</div>` : ""}</td>
<td style="text-align:right;color:${dateColor};font-size:14px;white-space:nowrap">${escapeHtml(formatDate(t.dueDate, ctx) ?? "")} &nbsp;&#8250;</td>
</tr></table>`, "text-decoration:none;display:block")}
</td></tr>`,
  )
  .join("")}
</table>`
      : "";

  const total = input.dueSoon.length + input.overdue.length;
  const body = `${headline(ctx, null, `${escapeHtml(input.weekday)}: tasks due soon and updates for you`, input.orgName)}
<div style="margin:6px 0 18px">${button(ctx, "View in Trellis", links.myTasks)}</div>
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
${pill("Due soon", input.dueSoon.length, ACCENT, links.myTasks)}${pill("Overdue", input.overdue.length, "#c4372f", links.myTasks)}${pill("Unread in Inbox", input.unread, LINK, links.inbox)}
</tr></table>
${list("Tasks due soon", input.dueSoon, ACCENT)}${list("Overdue", input.overdue, "#c4372f")}`;

  const lines = (rows: DigestTask[]) => rows.map((t) => `- ${t.name} (${formatDate(t.dueDate, ctx)}): ${ctx.url(links.task(t.id, t.projectId))}`);
  return {
    subject: `${input.weekday} - tasks due soon: ${input.dueSoon.length}${input.overdue.length ? `, overdue: ${input.overdue.length}` : ""}`,
    html: layout(ctx, {
      preheader: total ? `${input.dueSoon.length} due soon, ${input.overdue.length} overdue` : `${input.unread} unread updates`,
      body,
      footerReason: "You're getting your daily update.",
    }),
    text: [
      `${input.weekday}: tasks due soon and updates for you`,
      ...(input.dueSoon.length ? ["", "Due soon:", ...lines(input.dueSoon)] : []),
      ...(input.overdue.length ? ["", "Overdue:", ...lines(input.overdue)] : []),
      ...(input.unread ? ["", `${input.unread} unread in your Inbox: ${ctx.url(links.inbox)}`] : []),
    ].join("\n"),
  };
}

/** Plain message with one button (invitations, account emails, test email). */
export function simpleEmail(
  ctxIn: { appUrl: (path: string) => string; timeZone?: string },
  input: { subject: string; title: string; paragraphs: string[]; cta?: { label: string; url: string }; footerReason: string },
): BuiltEmail {
  const ctx: Ctx = { url: ctxIn.appUrl, timeZone: ctxIn.timeZone ?? "UTC" };
  const cta = input.cta
    ? `<div style="margin:20px 0 4px"><a href="${escapeHtml(input.cta.url)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;font-size:15px">${escapeHtml(input.cta.label)}</a></div>`
    : "";
  const body = `<div style="font-size:20px;margin:8px 0 12px">${escapeHtml(input.title)}</div>
${input.paragraphs.map((p) => `<p style="margin:0 0 10px">${escapeHtml(p)}</p>`).join("")}${cta}`;
  return {
    subject: input.subject,
    html: layout(ctx, { preheader: input.paragraphs[0] ?? input.title, body, footerReason: input.footerReason }),
    text: [input.title, "", ...input.paragraphs, ...(input.cta ? ["", `${input.cta.label}: ${input.cta.url}`] : [])].join("\n"),
  };
}

/** First sign-in. */
export function welcomeEmail(
  ctxIn: { appUrl: (path: string) => string; timeZone: string },
  input: { firstName: string; orgName: string; projects: { id: string; name: string }[] },
): BuiltEmail {
  const ctx: Ctx = { url: ctxIn.appUrl, timeZone: ctxIn.timeZone };
  const item = (path: string, title: string, sub: string) =>
    `<tr><td style="padding:12px 0;border-top:1px solid ${BORDER}">${link(ctx, path, `<b style="color:${TEXT}">${escapeHtml(title)}</b><div style="color:${MUTED};font-size:14px">${escapeHtml(sub)}</div>`, "text-decoration:none;display:block")}</td></tr>`;
  const body = `${headline(ctx, null, `Welcome to Trellis, ${escapeHtml(input.firstName)}`, input.orgName)}
<div style="margin:6px 0 18px">${button(ctx, "Open Trellis", links.home)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${item(links.myTasks, "My tasks", "Everything assigned to you, in one list")}
${item(links.inbox, "Inbox", "Comments, mentions and assignments for you")}
${input.projects.map((p) => item(links.project(p.id), p.name, "A project you were added to")).join("")}
${input.projects.length ? "" : item(links.projects, "Projects", "Browse your team's projects")}
</table>`;
  return {
    subject: "Welcome to Trellis",
    html: layout(ctx, { preheader: "Your account is ready.", body, footerReason: "You're getting this because you just joined Trellis." }),
    text: `Welcome to Trellis, ${input.firstName}. Open Trellis: ${ctx.url(links.home)}`,
  };
}

/** Tells the inviter that their invitation was accepted. */
export function inviteAcceptedEmail(
  ctxIn: { appUrl: (path: string) => string; timeZone: string },
  input: { person: Person; orgName: string; projects: { id: string; name: string; color: string }[] },
): BuiltEmail {
  const ctx: Ctx = { url: ctxIn.appUrl, timeZone: ctxIn.timeZone };
  const main = input.projects[0] ? links.project(input.projects[0].id) : links.projects;
  const body = `${headline(ctx, input.person, `${escapeHtml(input.person.name)} accepted your Trellis invitation`, input.orgName)}
<div style="margin:6px 0 18px">${button(ctx, "View in Trellis", main)}</div>
<p style="color:${MUTED};margin:0 0 14px">${escapeHtml(input.person.name)} may be in other projects and teams too. We only show ones visible to you.</p>
${
  input.projects.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:10px">
<tr><td style="padding:14px 16px;font-weight:bold">${escapeHtml(input.person.name)}'s projects</td></tr>
${input.projects
  .map(
    (p) => `<tr><td style="padding:12px 16px;border-top:1px solid ${BORDER}">${link(ctx, links.project(p.id), `<span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${COLORS[p.color] ?? COLORS.teal};vertical-align:middle"></span>&nbsp; <span style="color:${TEXT}">${escapeHtml(p.name)}</span> <span style="float:right;color:${FAINT}">&#8250;</span>`, "text-decoration:none;display:block")}</td></tr>`,
  )
  .join("")}
<tr><td style="padding:12px 16px;border-top:1px solid ${BORDER}">${link(ctx, links.projects, "View in Trellis")}</td></tr>
</table>`
    : ""
}`;
  return {
    subject: `${input.person.name} accepted your invite to Trellis`,
    html: layout(ctx, { preheader: `${input.person.name} joined Trellis.`, body, footerReason: "You're getting this because you invited them." }),
    text: `${input.person.name} accepted your Trellis invitation. ${ctx.url(main)}`,
  };
}
