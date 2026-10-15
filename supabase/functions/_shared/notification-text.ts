// Pure helpers shared by the web app's Inbox and the notification emails.
// Keep this file free of runtime-specific imports: it is compiled by both
// Next.js (src/components/inbox/describe.ts re-exports it) and Deno.

export const STATUS_LABEL = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  on_hold: "On hold",
  complete: "Complete",
} as const;

export type StatusKey = keyof typeof STATUS_LABEL;

export type NotificationType =
  | "assigned"
  | "mentioned"
  | "commented"
  | "completed"
  | "due_soon"
  | "added_to_project"
  | "status_update"
  | "goal_update"
  | "welcome"
  | "invite_accepted";

/** The notification columns these helpers read. */
export interface NotificationLike {
  type: string;
  data: unknown;
  actor_id: string | null;
  task_id: string | null;
  project_id: string | null;
  goal_id: string | null;
}

/** A sentence split into plain and emphasised runs so each renderer can style it. */
export type Segment = { text: string; strong?: boolean };

export interface DescribeContext {
  actorName?: string | null;
  taskName?: string | null;
  projectName?: string | null;
  goalName?: string | null;
}

function data(n: Pick<NotificationLike, "data">): Record<string, unknown> {
  return n.data && typeof n.data === "object" && !Array.isArray(n.data) ? (n.data as Record<string, unknown>) : {};
}

/** Comment excerpt with @[Name](id) mention markup shown as "@Name". */
export function notificationExcerpt(n: Pick<NotificationLike, "data">): string | null {
  const v = data(n).excerpt;
  if (typeof v !== "string") return null;
  const text = v
    .replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, "@$1")
    // The stored excerpt is cut at 200 characters, which can split a mention.
    .replace(/@\[([^\]]*)\]?\([0-9a-f-]*$/, "@$1")
    .trim();
  return text || null;
}

function statusLabel(v: unknown) {
  return typeof v === "string" && v in STATUS_LABEL ? STATUS_LABEL[v as StatusKey] : null;
}

/** Human sentence for a notification, e.g. "Ana assigned you **Plan fall retreat**". */
export function describeNotification(n: Pick<NotificationLike, "type" | "data" | "actor_id">, ctx: DescribeContext): Segment[] {
  const actor = ctx.actorName || (n.actor_id ? "Someone" : null);
  const task = ctx.taskName?.trim() || "a task";
  const project = ctx.projectName?.trim() || "a project";
  const goal = ctx.goalName?.trim() || "a goal";
  const d = data(n);
  const who = (fallback: string): Segment => ({ text: actor ?? fallback, strong: !!actor });

  switch (n.type as NotificationType) {
    case "assigned":
      return actor
        ? [who(""), { text: " assigned you " }, { text: task, strong: true }]
        : [{ text: "You were assigned " }, { text: task, strong: true }];
    case "mentioned":
      return [who("Someone"), { text: " mentioned you in " }, { text: task, strong: true }];
    case "commented":
      return [who("Someone"), { text: " commented on " }, { text: task, strong: true }];
    case "completed":
      return [who("Someone"), { text: " completed " }, { text: task, strong: true }];
    case "due_soon":
      return [{ text: task, strong: true }, { text: " is due tomorrow" }];
    case "added_to_project": {
      const role = typeof d.role === "string" ? ` as ${d.role}` : "";
      return [who("Someone"), { text: " added you to " }, { text: project, strong: true }, { text: role }];
    }
    case "status_update": {
      const status = statusLabel(d.status);
      const title = typeof d.title === "string" && d.title.trim() ? ` — ${d.title.trim()}` : "";
      return [
        who("Someone"),
        { text: " posted a status update" },
        { text: status ? ` (${status})` : "" },
        { text: " in " },
        { text: project, strong: true },
        { text: title },
      ];
    }
    case "goal_update": {
      const status = statusLabel(d.status);
      return [who("Someone"), { text: " updated the goal " }, { text: goal, strong: true }, { text: status ? ` to ${status}` : "" }];
    }
    case "welcome":
      return [{ text: "Welcome to " }, { text: "Trellis", strong: true }, { text: ". Your account is ready." }];
    case "invite_accepted":
      return [who("Someone"), { text: " accepted your invitation" }, ...(ctx.projectName ? [{ text: " to " }, { text: project, strong: true }] : [])];
    default:
      return [who("Someone"), { text: " sent you an update" }];
  }
}

export function segmentsToText(segments: Segment[]) {
  return segments.map((s) => s.text).join("");
}

/** In-app path a notification opens (matches src/lib/routes.ts). */
export function notificationHref(n: Pick<NotificationLike, "task_id" | "project_id" | "goal_id">): string {
  if (n.task_id) {
    return n.project_id ? `/project?id=${n.project_id}&view=list&task=${n.task_id}` : `/my-tasks?task=${n.task_id}`;
  }
  if (n.goal_id) return `/goal?id=${n.goal_id}`;
  if (n.project_id) return `/project?id=${n.project_id}`;
  return "/home";
}
