"use client";

import { useId, useState } from "react";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useUpdateTask, type TaskItem } from "@/lib/queries/tasks";
import { useTaskPane } from "@/lib/task-pane";
import { Button } from "@/components/ui/button";
import { cn, colorHex, toDate, toISODate } from "@/lib/utils";
import { useDragSensors } from "./dnd";
import type { TaskListContext } from "./my-tasks-list";

const DAY_PREFIX = "day:";
const MAX_PER_DAY = 3;

export function MyTasksCalendar({ tasks, ctx }: { tasks: TaskItem[]; ctx: TaskListContext }) {
  const dndId = useId();
  const sensors = useDragSensors();
  const update = useUpdateTask();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) });
  const byDay = new Map<string, TaskItem[]>();
  let undated = 0;
  for (const t of tasks) {
    if (!t.due_date) {
      undated++;
      continue;
    }
    if (!byDay.has(t.due_date)) byDay.set(t.due_date, []);
    byDay.get(t.due_date)!.push(t);
  }
  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const overId = e.over ? String(e.over.id) : null;
    const task = tasks.find((t) => t.id === String(e.active.id));
    if (!overId?.startsWith(DAY_PREFIX) || !task) return;
    const due = overId.slice(DAY_PREFIX.length);
    if (due === task.due_date) return;
    // Keep the task's duration when it has a start date.
    let start = task.start_date;
    const oldDue = toDate(task.due_date);
    const oldStart = toDate(task.start_date);
    if (oldStart && oldDue) {
      start = toISODate(addDays(oldStart, differenceInCalendarDays(toDate(due)!, oldDue)));
    } else if (oldStart && oldStart > toDate(due)!) {
      start = null;
    }
    update.mutate({ id: task.id, due_date: due, start_date: start });
  };

  return (
    <div className="flex h-full min-h-0 flex-col px-4 pb-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-2 py-2">
        <Button size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
          Today
        </Button>
        <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={16} />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight size={16} />
        </Button>
        <h2 className="text-[15px] font-semibold">{format(month, "MMMM yyyy")}</h2>
        {undated > 0 && <span className="ml-auto text-xs text-faint">{undated} without a due date</span>}
      </div>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border scrollbar-thin">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-[11.5px] font-medium text-faint">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="py-1.5">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid auto-rows-[minmax(104px,1fr)] grid-cols-7">
              {days.map((d) => {
                const key = toISODate(d)!;
                const list = byDay.get(key) ?? [];
                const showAll = expanded === key;
                const shown = showAll ? list : list.slice(0, MAX_PER_DAY);
                return (
                  <DayCell key={key} id={key} date={d} inMonth={isSameMonth(d, month)}>
                    {shown.map((t) => (
                      <CalendarChip key={t.id} task={t} ctx={ctx} />
                    ))}
                    {list.length > MAX_PER_DAY && (
                      <button
                        type="button"
                        onClick={() => setExpanded(showAll ? null : key)}
                        className="w-full rounded px-1 text-left text-[11px] text-muted hover:bg-surface-2"
                      >
                        {showAll ? "Show less" : `+${list.length - MAX_PER_DAY} more`}
                      </button>
                    )}
                  </DayCell>
                );
              })}
            </div>
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? <ChipBody task={active} ctx={ctx} className="w-40 shadow-pop" /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function DayCell({
  id,
  date,
  inMonth,
  children,
}: {
  id: string;
  date: Date;
  inMonth: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${DAY_PREFIX}${id}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-w-0 space-y-0.5 border-r border-b border-border p-1 [&:nth-child(7n)]:border-r-0",
        !inMonth && "bg-surface-2/50",
        isOver && "bg-accent-soft/60",
      )}
    >
      <div
        className={cn(
          "mb-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11.5px]",
          inMonth ? "text-muted" : "text-faint",
          isToday(date) && "bg-accent font-semibold text-accent-text",
        )}
      >
        {format(date, "d")}
      </div>
      {children}
    </div>
  );
}

function CalendarChip({ task, ctx }: { task: TaskItem; ctx: TaskListContext }) {
  const { openTask } = useTaskPane();
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...listeners} className={cn(isDragging && "opacity-40")}>
      <ChipBody task={task} ctx={ctx} onClick={() => openTask(task.id)} />
    </div>
  );
}

function ChipBody({
  task,
  ctx,
  onClick,
  className,
}: {
  task: TaskItem;
  ctx: TaskListContext;
  onClick?: () => void;
  className?: string;
}) {
  const project = task.project_id ? ctx.projects.get(task.project_id) : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      title={task.name}
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5 text-left text-[11.5px] hover:border-border-strong",
        task.completed && "text-faint line-through",
        className,
      )}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-sm"
        style={{ background: project ? colorHex(project.color) : "var(--border-strong)" }}
      />
      <span className="truncate">{task.name || "Untitled task"}</span>
    </button>
  );
}
