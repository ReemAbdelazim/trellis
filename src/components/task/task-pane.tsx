"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  ChevronRight,
  Diamond,
  Link as LinkIcon,
  MoreHorizontal,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useMe } from "@/lib/queries/me";
import { useProjects, useSections } from "@/lib/queries/projects";
import { useCanEditTask, useDeleteTask, useTask, useUpdateTask } from "@/lib/queries/tasks";
import { useFollowers, useLikes, useSetFollower, useToggleLike } from "@/lib/queries/task-detail";
import { useCustomFields, useSetFieldValue, useTaskFieldValues } from "@/lib/queries/fields";
import { useProfileMap } from "@/lib/queries/people";
import { useRealtime } from "@/lib/queries/realtime";
import { qk } from "@/lib/queries/keys";
import { useTaskPane } from "@/lib/task-pane";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { ConfirmDialog, PageLoader } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { MultiUserPicker } from "@/components/ui/user-picker";
import { Tooltip } from "@/components/ui/tooltip";
import { FieldValueEditor } from "@/components/fields/field-value-editor";
import { DatePicker } from "@/components/ui/date-picker";
import { cn, colorHex, timeAgo } from "@/lib/utils";
import { AssigneeButton, DueDateButton } from "./task-bits";
import { TaskSubtasks } from "./task-subtasks";
import { TaskAttachments } from "./task-attachments";
import { TaskDependencies } from "./task-dependencies";
import { TaskFeed } from "./task-feed";
import type { Task } from "@/types/models";
import { absoluteUrl, routes } from "@/lib/routes";

export function TaskPane() {
  const { taskId, closeTask } = useTaskPane();

  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "Escape" && !target.closest("input, textarea, [role=dialog], [role=menu], [data-radix-popper-content-wrapper]")) {
        closeTask();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [taskId, closeTask]);

  if (!taskId) return null;
  return (
    <aside
      className="fixed inset-0 z-30 flex flex-col bg-surface md:absolute md:inset-y-0 md:right-0 md:left-auto md:w-[min(600px,100%)] md:border-l md:border-border md:shadow-pop"
      aria-label="Task details"
    >
      <TaskDetail key={taskId} taskId={taskId} onClose={closeTask} />
    </aside>
  );
}

function useCanComment(taskId: string) {
  return useQuery({
    queryKey: qk.canCommentTask(taskId),
    queryFn: async () => {
      const { data, error } = await createClient().rpc("can_comment_task", { p_task: taskId });
      if (error) throw error;
      return !!data;
    },
    staleTime: 60_000,
  });
}

function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const me = useMe();
  const { data: task, isLoading } = useTask(taskId);
  const { data: canEdit = false } = useCanEditTask(taskId);
  const { data: canComment = false } = useCanComment(taskId);
  const update = useUpdateTask();
  const del = useDeleteTask();
  const { openTask } = useTaskPane();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useRealtime({ table: "tasks", filter: `id=eq.${taskId}`, invalidate: [qk.task(taskId)] });

  if (isLoading) return <PageLoader />;
  if (!task) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex justify-end p-2">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={17} />
          </Button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <p className="font-medium">This task doesn&apos;t exist or you don&apos;t have access to it.</p>
          <p className="mt-1 text-sm text-muted">It may have been deleted, or it&apos;s in a private project.</p>
        </div>
      </div>
    );
  }

  const copyLink = async () => {
    const url = absoluteUrl(routes.task(task.id, task.project_id));
    await navigator.clipboard.writeText(url);
    toast.success("Task link copied");
  };

  return (
    <>
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        {canEdit ? (
          <Button
            size="sm"
            variant={task.completed ? "subtle" : "secondary"}
            className={cn(task.completed && "border border-success bg-success-soft text-success")}
            onClick={() => update.mutate({ id: task.id, completed: !task.completed })}
          >
            <Check size={14} /> {task.completed ? "Completed" : "Mark complete"}
          </Button>
        ) : (
          task.completed && <span className="text-sm text-success">Completed</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <LikeButton taskId={task.id} />
          <Tooltip content="Copy task link">
            <Button variant="ghost" size="icon" onClick={copyLink} aria-label="Copy task link">
              <LinkIcon size={16} />
            </Button>
          </Tooltip>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal size={17} />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem
                icon={<Diamond size={14} />}
                disabled={!canEdit}
                onSelect={() => update.mutate({ id: task.id, is_milestone: !task.is_milestone })}
              >
                {task.is_milestone ? "Unmark as milestone" : "Mark as milestone"}
              </MenuItem>
              <MenuItem icon={<LinkIcon size={14} />} onSelect={copyLink}>
                Copy task link
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 size={14} />} danger disabled={!canEdit} onSelect={() => setConfirmDelete(true)}>
                Delete task
              </MenuItem>
            </MenuContent>
          </Menu>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close task">
            <X size={18} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="space-y-6 px-6 py-5">
          {task.parent_id && <ParentCrumb parentId={task.parent_id} onOpen={openTask} />}
          <TaskName task={task} disabled={!canEdit} />

          <dl className="grid grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2.5 text-[13px]">
            <dt className="text-muted">Assignee</dt>
            <dd>
              <AssigneeButton task={task} disabled={!canEdit} showName />
            </dd>
            <dt className="text-muted">Due date</dt>
            <dd>
              {task.due_date && <DueDateButton task={task} disabled={!canEdit} className="-ml-1" />}
              {!task.due_date && canEdit && <EmptyDue task={task} />}
              {!task.due_date && !canEdit && <span className="text-faint">No due date</span>}
            </dd>
            {!task.parent_id && (
              <>
                <dt className="text-muted">Project</dt>
                <dd>
                  <ProjectField task={task} canEdit={canEdit} />
                </dd>
              </>
            )}
            {task.project_id && !task.parent_id && (
              <>
                <dt className="text-muted">Dependencies</dt>
                <dd>
                  <TaskDependencies task={task} canEdit={canEdit} />
                </dd>
              </>
            )}
            {task.project_id && !task.parent_id && <CustomFieldRows task={task} canEdit={canEdit} />}
          </dl>

          <Description task={task} disabled={!canEdit} />
          <TaskSubtasks taskId={task.id} canEdit={canEdit} />
          <TaskAttachments taskId={task.id} canAttach={canComment} canEdit={canEdit} />

          <div className="border-t border-border pt-5">
            <TaskFeed taskId={task.id} canComment={canComment} />
          </div>
        </div>
      </div>

      <Followers task={task} meId={me.id} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this task?"
        description="The task, its subtasks, comments, and attachments will be permanently deleted."
        onConfirm={() => {
          del.mutate(task);
          setConfirmDelete(false);
          onClose();
        }}
      />
    </>
  );
}

function EmptyDue({ task }: { task: Task }) {
  const update = useUpdateTask();
  return (
    <DatePicker
      due={task.due_date}
      start={task.start_date}
      onChange={({ due, start }) => update.mutate({ id: task.id, due_date: due, start_date: start })}
    >
      <button className="-ml-1 rounded px-1 py-0.5 text-faint hover:bg-surface-2 hover:text-text">No due date</button>
    </DatePicker>
  );
}

function ParentCrumb({ parentId, onOpen }: { parentId: string; onOpen: (id: string) => void }) {
  const { data: parent } = useTask(parentId);
  if (!parent) return null;
  return (
    <button onClick={() => onOpen(parent.id)} className="-mb-3 flex items-center gap-1 text-xs text-muted hover:text-text">
      {parent.name || "Untitled task"} <ChevronRight size={12} />
    </button>
  );
}

function TaskName({ task, disabled }: { task: Task; disabled: boolean }) {
  const update = useUpdateTask();
  const [draft, setDraft] = useState(task.name);
  const focused = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focused.current) setDraft(task.name);
  }, [task.name]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const save = () => {
    const name = draft.trim();
    if (name !== task.name) update.mutate({ id: task.id, name });
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      value={draft}
      readOnly={disabled}
      autoFocus={!task.name && !disabled}
      placeholder="Write a task name"
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        save();
      }}
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      className={cn(
        "-mx-2 w-[calc(100%+16px)] resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-xl leading-snug font-semibold outline-none",
        !disabled && "hover:border-border focus:border-accent",
        task.completed && "text-muted",
      )}
    />
  );
}

function Description({ task, disabled }: { task: Task; disabled: boolean }) {
  const update = useUpdateTask();
  const [draft, setDraft] = useState(task.description);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focused.current) setDraft(task.description);
  }, [task.description]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 72)}px`;
  }, [draft]);

  const save = (value: string) => {
    if (value !== task.description) update.mutate({ id: task.id, description: value });
  };

  // Flush a pending autosave when the pane closes or switches to another task.
  const pending = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      pending.current?.();
    },
    [],
  );

  return (
    <div>
      <h3 className="mb-1.5 text-[13px] font-semibold">Description</h3>
      <textarea
        ref={ref}
        value={draft}
        readOnly={disabled}
        placeholder={disabled ? "No description" : "What is this task about?"}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          clearTimeout(timer.current);
          pending.current = null;
          save(draft);
        }}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          clearTimeout(timer.current);
          pending.current = () => save(v);
          timer.current = setTimeout(() => {
            pending.current = null;
            save(v);
          }, 1200);
        }}
        className={cn(
          "-mx-2 w-[calc(100%+16px)] resize-none rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm leading-relaxed outline-none placeholder:text-faint",
          !disabled && "hover:border-border focus:border-accent",
        )}
      />
    </div>
  );
}

function ProjectField({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const { data: projects = [] } = useProjects();
  const { data: sections = [] } = useSections(task.project_id);
  const update = useUpdateTask();
  const project = projects.find((p) => p.id === task.project_id);

  if (!task.project_id) {
    return canEdit ? (
      <select
        value=""
        onChange={(e) => e.target.value && update.mutate({ id: task.id, project_id: e.target.value, section_id: null })}
        className="h-7 rounded border border-transparent bg-transparent px-1 text-[13px] text-faint hover:border-border"
      >
        <option value="">Add to a project…</option>
        {projects
          .filter((p) => !p.archived && !p.is_template)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>
    ) : (
      <span className="text-faint">My tasks only</span>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Link
        href={routes.project(task.project_id)}
        className="inline-flex h-6 max-w-56 items-center gap-1.5 rounded-full bg-surface-2 px-2 text-xs hover:bg-surface-3"
      >
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colorHex(project?.color) }} />
        <span className="truncate">{project?.name ?? "Project"}</span>
      </Link>
      {sections.length > 0 && (
        <select
          value={task.section_id ?? ""}
          disabled={!canEdit}
          onChange={(e) => update.mutate({ id: task.id, section_id: e.target.value })}
          className="h-7 rounded border border-transparent bg-transparent px-1 text-xs text-muted hover:border-border disabled:hover:border-transparent"
          aria-label="Section"
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function CustomFieldRows({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const { data: fields = [] } = useCustomFields(task.project_id);
  const { data: values = [] } = useTaskFieldValues(task.id);
  const set = useSetFieldValue(task.project_id);
  return (
    <>
      {fields.map((f) => (
        <FieldRow key={f.id} label={f.name}>
          <FieldValueEditor
            field={f}
            value={values.find((v) => v.field_id === f.id)?.value ?? null}
            disabled={!canEdit}
            onChange={(value) => set.mutate({ taskId: task.id, fieldId: f.id, value })}
          />
        </FieldRow>
      ))}
    </>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="truncate text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function LikeButton({ taskId }: { taskId: string }) {
  const me = useMe();
  const { data: likes = [] } = useLikes(taskId);
  const toggle = useToggleLike(taskId);
  const people = useProfileMap();
  const liked = likes.includes(me.id);
  const names = likes.map((id) => people.get(id)?.full_name).filter(Boolean).join(", ");
  return (
    <Tooltip content={likes.length ? `Liked by ${names}` : "Like"}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => toggle.mutate({ userId: me.id, like: !liked })}
        className={cn(liked && "text-accent")}
        aria-pressed={liked}
        aria-label="Like task"
      >
        <ThumbsUp size={15} className={cn(liked && "fill-current")} />
        {likes.length > 0 && likes.length}
      </Button>
    </Tooltip>
  );
}

function Followers({ task, meId }: { task: Task; meId: string }) {
  const { data: followers = [] } = useFollowers(task.id);
  const set = useSetFollower(task.id);
  const people = useProfileMap();
  const following = followers.includes(meId);
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-t border-border bg-surface-2 px-4 text-xs text-muted">
      <span>Followers</span>
      <MultiUserPicker value={followers} onToggle={(userId, follow) => set.mutate({ userId, follow })}>
        <button className="rounded-full hover:opacity-80" aria-label="Manage followers">
          {followers.length ? (
            <AvatarStack profiles={followers.map((id) => people.get(id))} max={6} size="xs" />
          ) : (
            <Avatar profile={null} size="xs" />
          )}
        </button>
      </MultiUserPicker>
      <span className="ml-auto text-faint">Created {timeAgo(task.created_at)}</span>
      <Button size="xs" variant="ghost" onClick={() => set.mutate({ userId: meId, follow: !following })}>
        {following ? "Leave task" : "Follow task"}
      </Button>
    </div>
  );
}
