"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner, StatusPill } from "@/components/ui/misc";
import { useMe } from "@/lib/queries/me";
import { useProfileMap } from "@/lib/queries/people";
import { usePostStatusUpdate, useProjectStatusUpdates } from "@/lib/queries/projects";
import { cn, errorMessage, timeAgo } from "@/lib/utils";
import { STATUS_DOT, STATUS_LABEL, type Project, type StatusColor } from "@/types/models";

const STATUSES: StatusColor[] = ["on_track", "at_risk", "off_track", "on_hold", "complete"];
const PAGE = 5;

export function StatusUpdates({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const { data: updates = [], isLoading } = useProjectStatusUpdates(project.id);
  const people = useProfileMap();
  const [composing, setComposing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? updates : updates.slice(0, PAGE);

  return (
    <section aria-labelledby="status-updates-heading">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="status-updates-heading" className="text-[15px] font-semibold">
          Status updates
        </h2>
        {canEdit && !composing && (
          <Button size="sm" variant="primary" onClick={() => setComposing(true)}>
            <Megaphone size={14} />
            Post update
          </Button>
        )}
      </div>

      {composing && (
        <StatusComposer
          projectId={project.id}
          initialStatus={project.current_status ?? "on_track"}
          onDone={() => setComposing(false)}
        />
      )}

      {isLoading ? (
        <div className="py-6 text-center">
          <Spinner />
        </div>
      ) : updates.length === 0 ? (
        !composing && (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            No status updates yet.
            {canEdit && " Post one to let everyone know how the project is going."}
          </div>
        )
      ) : (
        <ol className="flex flex-col gap-3">
          {shown.map((u, i) => {
            const author = u.author_id ? people.get(u.author_id) : undefined;
            return (
              <li key={u.id} className="rounded-xl border border-border bg-surface p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={u.status} />
                  {i === 0 && <span className="text-[11px] font-medium text-faint uppercase">Latest</span>}
                </div>
                <h3 className="mt-2 text-[15px] font-semibold">{u.title || STATUS_LABEL[u.status]}</h3>
                {u.body && <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-wrap text-text">{u.body}</p>}
                <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Avatar profile={author} size="xs" />
                  <span>{author?.full_name ?? "Former member"}</span>
                  <span aria-hidden>·</span>
                  <time dateTime={u.created_at} title={format(parseISO(u.created_at), "PPpp")}>
                    {timeAgo(u.created_at)}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {updates.length > PAGE && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show fewer" : `Show all ${updates.length} updates`}
        </Button>
      )}
    </section>
  );
}

function StatusComposer({
  projectId,
  initialStatus,
  onDone,
}: {
  projectId: string;
  initialStatus: StatusColor;
  onDone: () => void;
}) {
  const me = useMe();
  const post = usePostStatusUpdate(projectId);
  const [status, setStatus] = useState<StatusColor>(initialStatus);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    post.mutate(
      { status, title: title.trim() || STATUS_LABEL[status], body: body.trim(), author_id: me.id },
      {
        onSuccess: () => {
          toast.success("Status update posted");
          onDone();
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <form onSubmit={submit} className="mb-4 rounded-xl border border-border bg-surface p-4 shadow-card">
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted">Status</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Project status">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px]",
                status === s ? "border-accent bg-accent-soft font-medium text-text" : "border-border text-muted hover:bg-surface-2",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[s])} />
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="mt-3">
        <Label htmlFor="status-title">Title</Label>
        <Input
          id="status-title"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`e.g. ${STATUS_LABEL[status]} for the spring cohort`}
          autoFocus
        />
      </div>
      <div className="mt-3">
        <Label htmlFor="status-body">Summary</Label>
        <Textarea
          id="status-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What's been accomplished, what's next, and any blockers"
          className="min-h-24"
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={onDone} disabled={post.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={post.isPending}>
          {post.isPending && <Spinner size={14} className="text-current" />}
          Post update
        </Button>
      </div>
    </form>
  );
}
