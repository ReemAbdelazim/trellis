import { placeAt } from "@/lib/utils";
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

function bucketOf(t: Pick<TaskItem, "my_tasks_bucket">): Bucket {
  return (BUCKETS.some((b) => b.id === t.my_tasks_bucket) ? t.my_tasks_bucket : "recently_assigned") as Bucket;
}

/** Same order the server returns: position, then newest first. */
function manualOrder(a: TaskItem, b: TaskItem) {
  return a.my_tasks_position - b.my_tasks_position || b.created_at.localeCompare(a.created_at);
}

function dueOrder(a: TaskItem, b: TaskItem) {
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
 * `bucket:<id>` container). `group` is every task the drag moves, in display
 * order (several when a multi-selection is dragged). Returns [] when nothing
 * changes. When neighbours share a position (new rows all start at 0) the
 * target bucket is renumbered.
 */
export function computeMove(
  groups: Map<Bucket, TaskItem[]>,
  activeId: string,
  overId: string,
  reorder: boolean,
  group: string[] = [activeId],
): MoveUpdate[] {
  const moving = new Set(group);
  const bucketWith = (id: string) => [...groups].find(([, list]) => list.some((t) => t.id === id))?.[0] ?? null;

  const from = bucketWith(activeId);
  if (!from) return [];
  const to = overId.startsWith(BUCKET_DROP_PREFIX) ? (overId.slice(BUCKET_DROP_PREFIX.length) as Bucket) : bucketWith(overId);
  if (!to || !groups.has(to)) return [];

  const single = group.length === 1;
  const targetList = groups.get(to)!;
  const target = targetList.filter((t) => !moving.has(t.id));
  const place = (ordered: TaskItem[], index: number) =>
    placeAt(ordered, group, index, (t) => t.my_tasks_position).map(({ id, position }) => ({
      id,
      my_tasks_bucket: to,
      my_tasks_position: position,
    }));

  if (!reorder) {
    // Sorted by due date: only the bucket changes; the tasks go to the end of the manual order.
    if (single && from === to) return [];
    const manual = [...target].sort(manualOrder);
    return place(manual, manual.length);
  }

  let index = target.length;
  if (!overId.startsWith(BUCKET_DROP_PREFIX)) {
    const overIndex = targetList.findIndex((t) => t.id === overId);
    // Land before the hovered row, or after it when moving down within the same bucket (like arrayMove).
    const movingDown = from === to && targetList.findIndex((t) => t.id === activeId) < overIndex;
    if (single && overId === activeId) return [];
    index = targetList.slice(0, overIndex + (movingDown ? 1 : 0)).filter((t) => !moving.has(t.id)).length;
  }

  const updates = place(target, index);
  const active = targetList.find((t) => t.id === activeId);
  const unchanged = single && from === to && updates.length === 1 && updates[0].my_tasks_position === active?.my_tasks_position;
  return unchanged ? [] : updates;
}
