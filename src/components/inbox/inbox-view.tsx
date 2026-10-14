"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Bell, CheckCheck, Clock, Inbox, Mail, MailOpen } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useProjects } from "@/lib/queries/projects";
import { useProfileMap } from "@/lib/queries/people";
import { useNotifications, useNotificationTargets, useUpdateNotifications } from "@/lib/queries/notifications";
import { useRealtime } from "@/lib/queries/realtime";
import { qk } from "@/lib/queries/keys";
import { useTaskPane } from "@/lib/task-pane";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState, PageLoader } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, colorHex, timeAgo } from "@/lib/utils";
import { describeNotification, notificationExcerpt } from "./describe";
import type { Notification } from "@/types/models";
import { routes } from "@/lib/routes";

type View = "active" | "archived";

export function InboxView() {
  const me = useMe();
  const router = useRouter();
  const { openTask, taskId } = useTaskPane();
  const [view, setView] = useState<View>("active");
  const [unreadOnly, setUnreadOnly] = useState(false);

  useRealtime({ table: "notifications", filter: `user_id=eq.${me.id}`, invalidate: [qk.notifications] });
  const { data: notifications, isLoading } = useNotifications(view);
  const { data: targets } = useNotificationTargets(notifications);
  const { data: projects = [] } = useProjects();
  const profiles = useProfileMap();
  const update = useUpdateNotifications();

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const list = (notifications ?? []).filter((n) => !unreadOnly || !n.read_at);
  const unreadCount = (notifications ?? []).filter((n) => !n.read_at).length;

  const now = () => new Date().toISOString();

  const open = (n: Notification) => {
    if (!n.read_at) update.mutate({ ids: [n.id], patch: { read_at: now() } });
    if (n.task_id) openTask(n.task_id);
    else if (n.goal_id) router.push(routes.goal(n.goal_id));
    else if (n.project_id) router.push(routes.project(n.project_id));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-surface px-4 pt-4 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        <nav className="mt-3 flex gap-1" aria-label="Inbox views">
          {(
            [
              { id: "active", label: "Activity" },
              { id: "archived", label: "Archive" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              aria-current={view === t.id ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-[13.5px]",
                view === t.id ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text",
              )}
            >
              {t.label}
              {t.id === "active" && unreadCount > 0 && view === "active" && (
                <span className="rounded-full bg-accent px-1.5 text-[11px] leading-4 font-semibold text-accent-text">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted select-none">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Unread only
        </label>
        <div className="ml-auto flex items-center gap-1">
          {view === "active" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={!unreadCount}
                onClick={() =>
                  update.mutate({ ids: list.filter((n) => !n.read_at).map((n) => n.id), patch: { read_at: now() } })
                }
              >
                <CheckCheck size={14} /> <span className="hidden sm:inline">Mark all read</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!list.length}
                onClick={() => update.mutate({ ids: list.map((n) => n.id), patch: { archived_at: now() } })}
              >
                <Archive size={14} /> <span className="hidden sm:inline">Archive all</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <PageLoader />
        ) : !list.length ? (
          <EmptyState
            icon={view === "archived" ? <Archive size={28} /> : <Inbox size={28} />}
            title={
              view === "archived"
                ? "Nothing archived"
                : unreadOnly && notifications?.length
                  ? "No unread notifications"
                  : "You're all caught up"
            }
            description={
              view === "archived"
                ? "Archived notifications are kept here."
                : "Assignments, mentions, comments and project updates will show up here."
            }
          />
        ) : (
          <ul className="mx-auto max-w-4xl divide-y divide-border sm:px-4">
            {list.map((n) => {
              const actor = n.actor_id ? profiles.get(n.actor_id) : undefined;
              const task = n.task_id ? targets?.tasks.get(n.task_id) : undefined;
              const project = n.project_id ? projectMap.get(n.project_id) : undefined;
              const goal = n.goal_id ? targets?.goals.get(n.goal_id) : undefined;
              const segments = describeNotification(n, {
                actorName: actor?.full_name || actor?.email,
                taskName: task?.name,
                projectName: project?.name,
                goalName: goal?.name,
              });
              const excerpt = notificationExcerpt(n);
              const unread = !n.read_at;
              return (
                <li
                  key={n.id}
                  className={cn(
                    "group relative flex cursor-pointer gap-3 px-4 py-3 hover:bg-surface-2/60 sm:rounded-lg",
                    n.task_id && taskId === n.task_id && "bg-accent-soft/50",
                  )}
                  onClick={() => open(n)}
                >
                  <span
                    className={cn("mt-3 h-2 w-2 shrink-0 rounded-full", unread ? "bg-accent" : "bg-transparent")}
                    aria-label={unread ? "Unread" : undefined}
                  />
                  {n.type === "due_soon" || !n.actor_id ? (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
                      {n.type === "due_soon" ? <Clock size={15} /> : <Bell size={15} />}
                    </span>
                  ) : (
                    <Avatar profile={actor} size="md" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[13.5px] leading-snug", unread ? "text-text" : "text-muted")}>
                      {segments.map((s, i) =>
                        s.strong ? (
                          <b key={i} className="font-semibold text-text">
                            {s.text}
                          </b>
                        ) : (
                          <span key={i}>{s.text}</span>
                        ),
                      )}
                    </p>
                    {excerpt && (
                      <p className="mt-1 line-clamp-2 border-l-2 border-border pl-2 text-[13px] text-muted">{excerpt}</p>
                    )}
                    <div className="mt-1 flex min-w-0 items-center gap-2 text-[12px] text-faint">
                      {project && (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colorHex(project.color) }} />
                          <span className="truncate">{project.name}</span>
                        </span>
                      )}
                      {task?.completed && <span className="shrink-0 text-success">Completed</span>}
                      <span className="shrink-0">{timeAgo(n.created_at)}</span>
                    </div>
                  </div>
                  <div
                    className="flex shrink-0 items-start gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {view === "active" && (
                      <Tooltip content={unread ? "Mark as read" : "Mark as unread"}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hidden sm:inline-flex"
                          aria-label={unread ? "Mark as read" : "Mark as unread"}
                          onClick={() => update.mutate({ ids: [n.id], patch: { read_at: unread ? now() : null } })}
                        >
                          {unread ? <MailOpen size={15} /> : <Mail size={15} />}
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip content={view === "active" ? "Archive" : "Move to inbox"}>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={view === "active" ? "Archive" : "Move to inbox"}
                        onClick={() =>
                          update.mutate({
                            ids: [n.id],
                            patch:
                              view === "active"
                                ? { archived_at: now(), read_at: n.read_at ?? now() }
                                : { archived_at: null },
                          })
                        }
                      >
                        {view === "active" ? <Archive size={15} /> : <ArchiveRestore size={15} />}
                      </Button>
                    </Tooltip>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
