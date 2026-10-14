import { positionBetween } from "@/lib/utils";
import type { TaskItem } from "@/lib/queries/tasks";

export type Bucket = "recently_assigned" | "today" | "upcoming" | "later";

export const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "recently_assigned", label: "Recently assigned" },
  { id: "today", label: "Do today" },
  { id: "upcoming", label: "Do next week" },
  { id: "later", label: "Do later" },
];

export type CompletionFilter = "incomplete" | "completed" | "all";
export type SortMode = "manual" | "due";

export function bucketOf(t: Pick<TaskItem, "my_tasks_bucket">): Bucket {
  return (BUCKETS.some((b) => b.id === t.my_tasks_bucket) ? t.my_tasks_bucket : "recently_assigned") as Bucket;
}

/** Same order the server returns: position, then newest first. */
export function manualOrder(a: TaskItem, b: TaskItem) {
  return a.my_tasks_position - b.my_tasks_position || b.created_at.localeCompare(a.created_at);
}

export function dueOrder(a: TaskItem, b: TaskItem) {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date) || manualOrder(a, b);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return manualOrder(a, b);
}

export function filterTasks(tasks: TaskItem[], filter: CompletionFilter) {
  if (filter === "all") return tasks;
  return tasks.filter((t) => (filter === "completed" ? t.completed : !t.completed));
}

/** Tasks grouped per bucket, each list sorted for display. */
export function groupByBucket(tasks: TaskItem[], sort: SortMode) {
  const groups = new Map<Bucket, TaskItem[]>(BUCKETS.map((b) => [b.id, []]));
  for (const t of tasks) groups.get(bucketOf(t))!.push(t);
  for (const list of groups.values()) list.sort(sort === "due" ? dueOrder : manualOrder);
  return groups;
}

export const BUCKET_DROP_PREFIX = "bucket:";

export interface MoveUpdate {
  id: string;
  my_tasks_bucket: Bucket;
  my_tasks_position: number;
}

/**
 * Work out the updates for dropping `activeId` onto `overId` (a task id or a
 * `bucket:<id>` container). Returns [] when nothing changes. When neighbours
 * share a position (new rows all start at 0) the target bucket is renumbered.
 */
export function computeMove(
  groups: Map<Bucket, TaskItem[]>,
  activeId: string,
  overId: string,
  reorder: boolean,
): MoveUpdate[] {
  let from: Bucket | null = null;
  let active: TaskItem | undefined;
  for (const [b, list] of groups) {
    const t = list.find((x) => x.id === activeId);
    if (t) {
      from = b;
      active = t;
    }
  }
  if (!from || !active) return [];

  let to: Bucket | null = null;
  let overTask: TaskItem | undefined;
  if (overId.startsWith(BUCKET_DROP_PREFIX)) {
    to = overId.slice(BUCKET_DROP_PREFIX.length) as Bucket;
  } else {
    for (const [b, list] of groups) {
      const t = list.find((x) => x.id === overId);
      if (t) {
        to = b;
        overTask = t;
      }
    }
  }
  if (!to || !groups.has(to)) return [];

  const source = groups.get(from)!;
  const target = groups.get(to)!.filter((t) => t.id !== activeId);

  if (!reorder) {
    // Sorted by due date: only the bucket changes, the task goes to the end of the manual order.
    if (from === to) return [];
    const manual = [...target].sort(manualOrder);
    const last = manual[manual.length - 1];
    return [{ id: activeId, my_tasks_bucket: to, my_tasks_position: positionBetween(last?.my_tasks_position, null) }];
  }

  let index: number;
  if (!overTask) {
    index = target.length;
  } else if (from === to) {
    const fromIndex = source.findIndex((t) => t.id === activeId);
    const overIndex = source.findIndex((t) => t.id === overTask.id);
    if (fromIndex === overIndex) return [];
    // Mirror arrayMove: moving down lands after the hovered row, moving up before it.
    index = target.findIndex((t) => t.id === overTask.id) + (fromIndex < overIndex ? 1 : 0);
  } else {
    index = target.findIndex((t) => t.id === overTask.id);
  }

  const ordered = [...target];
  ordered.splice(index, 0, active);
  const prev = ordered[index - 1];
  const next = ordered[index + 1];
  const pos = positionBetween(prev?.my_tasks_position, next?.my_tasks_position);
  const fits =
    (!prev || prev.my_tasks_position < pos) && (!next || pos < next.my_tasks_position) && Number.isFinite(pos);

  if (fits) {
    if (from === to && pos === active.my_tasks_position) return [];
    return [{ id: activeId, my_tasks_bucket: to, my_tasks_position: pos }];
  }
  // Renumber the whole bucket in its new order.
  return ordered
    .map((t, i) => ({ t, pos: (i + 1) * 1000 }))
    .filter(({ t, pos: p }) => t.id === activeId || t.my_tasks_position !== p)
    .map(({ t, pos: p }) => ({ id: t.id, my_tasks_bucket: to, my_tasks_position: p }));
}
