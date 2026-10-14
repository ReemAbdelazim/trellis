"use client";

import { useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useProfileMap } from "@/lib/queries/people";
import { useActivity, useAddComment, useComments, useDeleteComment, useEditComment } from "@/lib/queries/task-detail";
import { useRealtime } from "@/lib/queries/realtime";
import { qk } from "@/lib/queries/keys";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { formatDue, timeAgo } from "@/lib/utils";
import { extractMentions, RichText } from "./rich-text";
import { MentionInput, type MentionInputHandle } from "./mention-input";
import type { Comment, Profile, TaskActivity } from "@/types/models";

type FeedItem = { kind: "comment"; at: string; comment: Comment } | { kind: "activity"; at: string; activity: TaskActivity };

function describe(a: TaskActivity, people: Map<string, Profile>): string {
  const d = (a.data ?? {}) as Record<string, string | null>;
  const name = (id?: string | null) => (id ? (people.get(id)?.full_name ?? "someone") : "no one");
  switch (a.kind) {
    case "created":
      return "created this task";
    case "renamed":
      return `renamed this task from “${d.from}”`;
    case "description_changed":
      return "changed the description";
    case "assigned":
      return `assigned to ${name(d.to)}`;
    case "unassigned":
      return "unassigned this task";
    case "due_changed":
      return d.to ? `changed the due date to ${formatDue(d.to)}` : "removed the due date";
    case "start_changed":
      return d.to ? `changed the start date to ${formatDue(d.to)}` : "removed the start date";
    case "completed":
      return "completed this task";
    case "reopened":
      return "marked this task incomplete";
    case "moved_section":
      return `moved this task to ${d.to ?? "another section"}`;
    case "moved_project":
      return d.to ? `moved this task to ${d.to}` : "removed this task from its project";
    case "attached":
      return `attached ${d.file_name}`;
    case "field_changed":
      return `changed ${d.field ?? "a field"}`;
    default:
      return a.kind.replace(/_/g, " ");
  }
}

export function TaskFeed({ taskId, canComment }: { taskId: string; canComment: boolean }) {
  const me = useMe();
  const people = useProfileMap();
  const { data: comments = [] } = useComments(taskId);
  const { data: activity = [] } = useActivity(taskId);
  const [showAll, setShowAll] = useState(false);

  useRealtime({ table: "comments", filter: `task_id=eq.${taskId}`, invalidate: [qk.comments(taskId)] });
  useRealtime({ table: "task_activity", filter: `task_id=eq.${taskId}`, invalidate: [qk.activity(taskId), qk.task(taskId)] });

  const items = useMemo(() => {
    const all: FeedItem[] = [
      ...comments.map((c) => ({ kind: "comment" as const, at: c.created_at, comment: c })),
      ...activity.map((a) => ({ kind: "activity" as const, at: a.created_at, activity: a })),
    ].sort((x, y) => x.at.localeCompare(y.at));
    return all;
  }, [comments, activity]);

  const hiddenCount = items.length > 8 && !showAll ? items.filter((i) => i.kind === "activity").length - 3 : 0;
  const visible = useMemo(() => {
    if (showAll || items.length <= 8) return items;
    // Always show comments; collapse older activity.
    const lastActivity = items.filter((i) => i.kind === "activity").slice(-3);
    return items.filter((i) => i.kind === "comment" || lastActivity.includes(i));
  }, [items, showAll]);

  return (
    <div>
      {hiddenCount > 0 && (
        <button onClick={() => setShowAll(true)} className="mb-3 text-xs font-medium text-muted hover:text-text">
          Show {hiddenCount} earlier updates
        </button>
      )}
      <ol className="space-y-3">
        {visible.map((item) =>
          item.kind === "activity" ? (
            <li key={`a${item.activity.id}`} className="flex items-start gap-2 pl-1 text-xs text-muted">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
              <span>
                <span className="font-medium text-text">{people.get(item.activity.actor_id ?? "")?.full_name ?? "Automation"}</span>{" "}
                {describe(item.activity, people)}
                {(item.activity.data as { rule?: string })?.rule && (
                  <span className="text-faint"> · via rule “{(item.activity.data as { rule?: string }).rule}”</span>
                )}
                <span className="text-faint"> · {timeAgo(item.activity.created_at)}</span>
              </span>
            </li>
          ) : (
            <CommentItem key={item.comment.id} taskId={taskId} comment={item.comment} mine={item.comment.author_id === me.id} isAdmin={me.role === "admin"} />
          ),
        )}
      </ol>
      {canComment && <Composer taskId={taskId} />}
    </div>
  );
}

function CommentItem({ taskId, comment, mine, isAdmin }: { taskId: string; comment: Comment; mine: boolean; isAdmin: boolean }) {
  const people = useProfileMap();
  const author = people.get(comment.author_id ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const edit = useEditComment(taskId);
  const del = useDeleteComment(taskId);
  return (
    <li className="group flex gap-2.5">
      <Avatar profile={author} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">{author?.full_name ?? "Former user"}</span>
          <span className="text-xs text-faint">
            {timeAgo(comment.created_at)}
            {comment.edited_at && " · edited"}
          </span>
          {(mine || isAdmin) && !editing && (
            <Menu>
              <MenuTrigger asChild>
                <button className="ml-auto rounded p-0.5 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2" aria-label="Comment options">
                  <MoreHorizontal size={15} />
                </button>
              </MenuTrigger>
              <MenuContent align="end">
                {mine && <MenuItem onSelect={() => setEditing(true)}>Edit comment</MenuItem>}
                <MenuItem danger onSelect={() => del.mutate(comment.id)}>
                  Delete comment
                </MenuItem>
              </MenuContent>
            </Menu>
          )}
        </div>
        {editing ? (
          <div className="mt-1 space-y-2">
            <MentionInput value={draft} onChange={setDraft} />
            <div className="flex gap-2">
              <Button
                size="xs"
                variant="primary"
                onClick={() => {
                  if (draft.trim()) edit.mutate({ id: comment.id, body: draft.trim() });
                  setEditing(false);
                }}
              >
                Save
              </Button>
              <Button size="xs" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <RichText text={comment.body} className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap" />
        )}
      </div>
    </li>
  );
}

function Composer({ taskId }: { taskId: string }) {
  const me = useMe();
  const [body, setBody] = useState("");
  const add = useAddComment(taskId);
  const input = useRef<MentionInputHandle>(null);
  const submit = () => {
    const text = body.trim();
    if (!text) return;
    add.mutate({ body: text, mentions: extractMentions(text), author_id: me.id });
    setBody("");
  };
  return (
    <div className="mt-4 flex gap-2.5">
      <Avatar profile={me} size="md" />
      <div className="flex-1">
        <MentionInput ref={input} value={body} onChange={setBody} onSubmit={submit} placeholder="Add a comment… use @ to mention" />
        {body.trim() && (
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={submit} disabled={add.isPending}>
              Comment
            </Button>
            <span className="text-[11px] text-faint">Ctrl + Enter to send</span>
          </div>
        )}
      </div>
    </div>
  );
}
