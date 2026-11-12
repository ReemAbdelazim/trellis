"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";
import type { Task, TaskInsert, TaskUpdate } from "@/types/models";

const supabase = () => createClient();

/** A task row plus the counts and tags list views show. */
export type TaskItem = Task & { subtask_count: number; comment_count: number; tag_ids: string[] };

/** Every task column the app uses (skips the large full-text `search` column). */
// (One literal string so supabase-js can infer the row type.)
export const TASK_COLUMNS =
  "id, project_id, section_id, parent_id, name, description, assignee_id, start_date, due_date, completed, completed_at, completed_by, is_milestone, estimate_hours, position, my_tasks_bucket, my_tasks_position, created_by, created_at, updated_at";

// Self-referencing embed: the column hint (`parent_id`) selects the child direction.
const TASK_SELECT = `${TASK_COLUMNS}, subtasks:tasks!parent_id(count), comments(count), task_tags(tag_id)` as const;

type RawTaskRow = Task & {
  subtasks?: { count: number }[];
  comments?: { count: number }[];
  task_tags?: { tag_id: string }[];
};

function toTaskItem(row: RawTaskRow): TaskItem {
  const { subtasks, comments, task_tags, ...task } = row;
  return {
    ...(task as Task),
    subtask_count: subtasks?.[0]?.count ?? 0,
    comment_count: comments?.[0]?.count ?? 0,
    tag_ids: (task_tags ?? []).map((t) => t.tag_id),
  };
}

/** A plain task row as a list item (no counts or tags loaded). */
export function asItem(task: Task | TaskItem): TaskItem {
  return { subtask_count: 0, comment_count: 0, tag_ids: [], ...task };
}

export function sortByPosition<T extends { position: number }>(list: T[]) {
  return [...list].sort((a, b) => a.position - b.position);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** All top-level tasks of a project (complete and incomplete). */
export function useProjectTasks(projectId: string | null | undefined) {
  return useQuery({
    queryKey: qk.projectTasks(projectId ?? ""),
    enabled: !!projectId,
    queryFn: async (): Promise<TaskItem[]> => {
      const { data, error } = await supabase()
        .from("tasks")
        .select(TASK_SELECT)
        .eq("project_id", projectId!)
        .is("parent_id", null)
        .order("position");
      if (error) throw error;
      return (data as unknown as RawTaskRow[]).map(toTaskItem);
    },
  });
}

/** Tasks (and subtasks) assigned to a user. */
export function useMyTasks(userId: string) {
  return useQuery({
    queryKey: qk.myTasks(userId),
    queryFn: async (): Promise<TaskItem[]> => {
      const { data, error } = await supabase()
        .from("tasks")
        .select(TASK_SELECT)
        .eq("assignee_id", userId)
        .order("my_tasks_position")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data as unknown as RawTaskRow[]).map(toTaskItem);
    },
  });
}

export function useSubtasks(parentId: string | null | undefined) {
  return useQuery({
    queryKey: qk.subtasks(parentId ?? ""),
    enabled: !!parentId,
    queryFn: async (): Promise<TaskItem[]> => {
      const { data, error } = await supabase()
        .from("tasks")
        .select(TASK_SELECT)
        .eq("parent_id", parentId!)
        .order("position");
      if (error) throw error;
      return (data as unknown as RawTaskRow[]).map(toTaskItem);
    },
  });
}

export function useTask(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.task(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<TaskItem | null> => {
      const { data, error } = await supabase().from("tasks").select(TASK_SELECT).eq("id", id!).maybeSingle();
      if (error) throw error;
      return data ? toTaskItem(data as unknown as RawTaskRow) : null;
    },
  });
}

/** Can the current user edit this task? (server-side rules via RPC) */
export function useCanEditTask(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.canEditTask(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase().rpc("can_edit_task", { p_task: id! });
      if (error) throw error;
      return !!data;
    },
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

/** Apply a patch to one or more tasks wherever they are cached. */
export function patchTaskInCaches(qc: QueryClient, ids: string | readonly string[], patch: Partial<TaskItem>) {
  const set = new Set(typeof ids === "string" ? [ids] : ids);
  qc.setQueriesData<TaskItem[]>({ queryKey: qk.tasks }, (list) =>
    Array.isArray(list) ? list.map((t) => (set.has(t.id) ? { ...t, ...patch } : t)) : list,
  );
  for (const id of set) qc.setQueryData<TaskItem | null>(qk.task(id), (t) => (t ? { ...t, ...patch } : t));
}

function removeTasksFromCaches(qc: QueryClient, ids: readonly string[]) {
  const set = new Set(ids);
  qc.setQueriesData<TaskItem[]>({ queryKey: qk.tasks }, (list) =>
    Array.isArray(list) ? list.filter((t) => !set.has(t.id)) : list,
  );
}

function adjustSubtaskCount(qc: QueryClient, parentId: string, delta: number) {
  qc.setQueriesData<TaskItem[]>({ queryKey: qk.tasks }, (list) =>
    Array.isArray(list)
      ? list.map((t) => (t.id === parentId ? { ...t, subtask_count: Math.max(0, t.subtask_count + delta) } : t))
      : list,
  );
}

export function snapshotTasks(qc: QueryClient) {
  return {
    lists: qc.getQueriesData<TaskItem[]>({ queryKey: qk.tasks }),
    singles: qc.getQueriesData<Task | null>({ queryKey: ["task"] }),
  };
}

export function restoreTasks(qc: QueryClient, snap: ReturnType<typeof snapshotTasks>) {
  snap.lists.forEach(([key, data]) => qc.setQueryData(key, data));
  snap.singles.forEach(([key, data]) => qc.setQueryData(key, data));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const MEMBERSHIP_FIELDS = ["assignee_id", "project_id", "parent_id", "due_date", "start_date", "completed"] as const;

// Shared by single and bulk edits: patch the caches straight away, roll back on
// failure, then take the server's copy (triggers can change completed_at, section, rules).
async function patchOptimistically(qc: QueryClient, ids: string[], patch: TaskUpdate) {
  await qc.cancelQueries({ queryKey: qk.tasks });
  await Promise.all(ids.map((id) => qc.cancelQueries({ queryKey: qk.task(id) })));
  const snap = snapshotTasks(qc);
  patchTaskInCaches(qc, ids, patch as Partial<TaskItem>);
  return { snap };
}

function rollBack(qc: QueryClient, err: unknown, ctx: { snap: ReturnType<typeof snapshotTasks> } | undefined) {
  if (ctx?.snap) restoreTasks(qc, ctx.snap);
  toast.error(errorMessage(err));
}

function settle(qc: QueryClient, rows: Task[], patch: TaskUpdate) {
  for (const row of rows) patchTaskInCaches(qc, row.id, row);
  if (rows.some((r) => r.project_id)) qc.invalidateQueries({ queryKey: qk.projectStats });
  // These change which lists a task belongs to (My tasks, a project, a date range),
  // so refetch the lists rather than only patching rows in place.
  if (MEMBERSHIP_FIELDS.some((f) => f in patch)) {
    qc.invalidateQueries({ queryKey: qk.tasks });
    for (const row of rows) qc.invalidateQueries({ queryKey: qk.canEditTask(row.id) });
  }
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: TaskUpdate & { id: string }) => {
      const { data, error } = await supabase().from("tasks").update(patch).eq("id", id).select(TASK_COLUMNS).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You don't have permission to edit this task");
      return data;
    },
    onMutate: ({ id, ...patch }) => patchOptimistically(qc, [id], patch),
    onError: (err, _vars, ctx) => rollBack(qc, err, ctx),
    onSuccess: (row, vars) => settle(qc, [row], vars),
  });
}

/** The same change to several tasks in one request; tasks you can't edit are left as they were. */
export function useUpdateTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: TaskUpdate }) => {
      const { data, error } = await supabase().from("tasks").update(patch).in("id", ids).select(TASK_COLUMNS);
      if (error) throw error;
      return data;
    },
    onMutate: ({ ids, patch }) => patchOptimistically(qc, ids, patch),
    onError: (err, _vars, ctx) => rollBack(qc, err, ctx),
    onSuccess: (rows, { ids, patch }) => {
      settle(qc, rows, patch);
      const skipped = ids.length - rows.length;
      if (skipped) {
        qc.invalidateQueries({ queryKey: qk.tasks });
        toast.error(`${skipped} of the selected tasks couldn't be changed: you don't have edit access to them`);
      }
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskInsert & { id: string }) => {
      const { data, error } = await supabase().from("tasks").insert(input).select(TASK_COLUMNS).single();
      if (error) throw error;
      return data;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: qk.tasks });
      const optimistic = asItem({
        name: "",
        description: "",
        project_id: null,
        section_id: null,
        parent_id: null,
        assignee_id: null,
        start_date: null,
        due_date: null,
        completed: false,
        completed_at: null,
        completed_by: null,
        is_milestone: false,
        estimate_hours: null,
        position: Date.now(),
        my_tasks_bucket: "recently_assigned",
        my_tasks_position: 0,
        created_by: input.created_by ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...input,
      } as Task);
      const add = (key: readonly unknown[]) =>
        qc.setQueryData<TaskItem[]>(key, (list) => (list ? [...list, optimistic] : list));
      if (input.parent_id) {
        add(qk.subtasks(input.parent_id));
        adjustSubtaskCount(qc, input.parent_id, 1);
      } else if (input.project_id) {
        add(qk.projectTasks(input.project_id));
      }
      if (input.assignee_id) add(qk.myTasks(input.assignee_id));
      return {};
    },
    onError: (err, input) => {
      removeTasksFromCaches(qc, [input.id]);
      if (input.parent_id) adjustSubtaskCount(qc, input.parent_id, -1);
      toast.error(errorMessage(err));
    },
    onSuccess: (row) => {
      patchTaskInCaches(qc, row.id, row);
      qc.invalidateQueries({ queryKey: qk.projectStats });
    },
  });
}

/** Delete one or more tasks (their subtasks go with them). */
export function useDeleteTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tasks: Pick<Task, "id" | "parent_id">[]) => {
      const ids = tasks.map((t) => t.id);
      const { data, error } = await supabase().from("tasks").delete().in("id", ids).select("id");
      if (error) throw error;
      if (data.length < ids.length) throw new Error("Some of these tasks couldn't be deleted: you don't have edit access to them");
    },
    onMutate: async (tasks) => {
      await qc.cancelQueries({ queryKey: qk.tasks });
      const snap = snapshotTasks(qc);
      removeTasksFromCaches(qc, tasks.map((t) => t.id));
      for (const t of tasks) if (t.parent_id) adjustSubtaskCount(qc, t.parent_id, -1);
      return { snap };
    },
    onError: (err, _t, ctx) => rollBack(qc, err, ctx),
    onSuccess: (_d, tasks) => tasks.forEach((t) => qc.removeQueries({ queryKey: qk.task(t.id) })),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.projectStats });
      // Subtasks are deleted with their parent; drop them from any list they were in.
      qc.invalidateQueries({ queryKey: qk.tasks });
    },
  });
}

/** Convenience: new task id generated client-side so optimistic rows never need swapping. */
export function newId() {
  return crypto.randomUUID();
}
