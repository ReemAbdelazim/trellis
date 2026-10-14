"use client";

import { useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  eachWeekOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  max as maxDate,
  min as minDate,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Check, ChevronLeft, ChevronRight, Diamond, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProfileMap } from "@/lib/queries/people";
import { cn, toDate, toISODate } from "@/lib/utils";
import type { Task } from "@/types/models";
import { useElementSize, useToday } from "./hooks";

export type CalendarTask = Pick<
  Task,
  "id" | "name" | "start_date" | "due_date" | "completed" | "is_milestone" | "assignee_id"
>;

export type CalendarDates = { start_date: string | null; due_date: string | null };

export interface MonthCalendarProps {
  tasks: CalendarTask[];
  onOpenTask: (taskId: string) => void;
  /** Called with the task's new dates after it's dropped on another day (start shifts along). */
  onMoveTask?: (taskId: string, dates: CalendarDates) => void;
  /** Quick-add from an empty day: `date` is yyyy-MM-dd. Omit to disable. */
  onCreate?: (date: string, name: string) => void;
  readOnly?: boolean;
  /** Extra controls rendered at the right of the toolbar. */
  toolbarExtra?: React.ReactNode;
  /** Show assignee avatars on task chips (default true). */
  showAssignee?: boolean;
  className?: string;
}

type Mode = "month" | "week";

const DAY_HEADER = 28;
const LANE_H = 22;
const MORE_H = 20;
const MIN_ROW_H = 112;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Item = { task: CalendarTask; s: Date; e: Date };
type Seg = { task: CalendarTask; s: Date; startCol: number; span: number; contL: boolean; contR: boolean; lane: number };

function taskRange(t: CalendarTask): { s: Date; e: Date } | null {
  const s = toDate(t.start_date ?? t.due_date);
  const e = toDate(t.due_date ?? t.start_date);
  if (!s || !e) return null;
  return s <= e ? { s, e } : { s: e, e: s };
}

/** Shift a task's dates by whole days, keeping nulls null. */
export function shiftTaskDates(t: Pick<Task, "start_date" | "due_date">, days: number): CalendarDates {
  const shift = (v: string | null) => (v ? toISODate(addDays(toDate(v)!, days)) : null);
  return { start_date: shift(t.start_date), due_date: shift(t.due_date) };
}

/** Pack the week's tasks into horizontal lanes (greedy, longest first on ties). */
function layoutWeek(weekStart: Date, items: Item[]): Seg[] {
  const weekEnd = addDays(weekStart, 6);
  const segs: Seg[] = [];
  const visible = items
    .filter((i) => i.s <= weekEnd && i.e >= weekStart)
    .map((i) => {
      const s = maxDate([i.s, weekStart]);
      const e = minDate([i.e, weekEnd]);
      return {
        item: i,
        s,
        startCol: differenceInCalendarDays(s, weekStart),
        span: differenceInCalendarDays(e, s) + 1,
      };
    })
    .sort(
      (a, b) =>
        a.startCol - b.startCol ||
        b.span - a.span ||
        Number(a.item.task.completed) - Number(b.item.task.completed) ||
        a.item.task.name.localeCompare(b.item.task.name),
    );
  const laneEnds: number[] = [];
  for (const v of visible) {
    let lane = laneEnds.findIndex((end) => end < v.startCol);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = v.startCol + v.span - 1;
    segs.push({
      task: v.item.task,
      s: v.s,
      startCol: v.startCol,
      span: v.span,
      contL: v.item.s < weekStart,
      contR: v.item.e > weekEnd,
      lane,
    });
  }
  return segs;
}

/**
 * Generic month/week calendar for tasks. Multi-day tasks render as bars spanning
 * start → due; drag a task to another day to move it, click an empty day to add one.
 */
export function MonthCalendar({
  tasks,
  onOpenTask,
  onMoveTask,
  onCreate,
  readOnly = false,
  toolbarExtra,
  showAssignee = true,
  className,
}: MonthCalendarProps) {
  const today = useToday();
  const [mode, setMode] = useState<Mode>("month");
  const [cursor, setCursor] = useState(() => today);
  const [adding, setAdding] = useState<string | null>(null);
  const [dragging, setDragging] = useState<CalendarTask | null>(null);
  const grab = useRef<{ taskId: string; date: Date } | null>(null);
  const [gridRef, gridSize] = useElementSize<HTMLDivElement>();

  const canMove = !readOnly && !!onMoveTask;
  const canCreate = !readOnly && !!onCreate;

  const weeks = useMemo(
    () =>
      mode === "month"
        ? eachWeekOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) })
        : [startOfWeek(cursor)],
    [mode, cursor],
  );

  const items = useMemo(
    () =>
      tasks.flatMap((task) => {
        const r = taskRange(task);
        return r ? [{ task, ...r }] : [];
      }),
    [tasks],
  );

  const rowH = Math.max(MIN_ROW_H, weeks.length ? gridSize.height / weeks.length : 0);
  const maxLanes = gridSize.height ? Math.max(1, Math.floor((rowH - DAY_HEADER - MORE_H) / LANE_H)) : 3;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.data.current?.taskId ?? "");
    setDragging(tasks.find((t) => t.id === id) ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const taskId = String(e.active.data.current?.taskId ?? "");
    const task = tasks.find((t) => t.id === taskId);
    const g = grab.current;
    grab.current = null;
    if (!task || !e.over || !onMoveTask) return;
    const target = toDate(String(e.over.id));
    const from = g && g.taskId === taskId ? g.date : taskRange(task)?.e;
    if (!target || !from) return;
    const delta = differenceInCalendarDays(target, from);
    if (delta !== 0) onMoveTask(taskId, shiftTaskDates(task, delta));
  };

  const title =
    mode === "month"
      ? format(cursor, "MMMM yyyy")
      : (() => {
          const s = weeks[0];
          const e = addDays(s, 6);
          return isSameMonth(s, e) ? `${format(s, "MMM d")} – ${format(e, "d, yyyy")}` : `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
        })();

  const step = (dir: 1 | -1) => setCursor((c) => (mode === "month" ? addMonths(startOfMonth(c), dir) : addWeeks(c, dir)));

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2 sm:px-6">
        <div className="flex items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" onClick={() => step(-1)} aria-label={mode === "month" ? "Previous month" : "Previous week"}>
            <ChevronLeft size={15} />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => step(1)} aria-label={mode === "month" ? "Next month" : "Next week"}>
            <ChevronRight size={15} />
          </Button>
        </div>
        <h2 className="min-w-0 text-[15px] font-semibold" aria-live="polite">
          {title}
        </h2>
        <Button size="sm" onClick={() => setCursor(today)}>
          Today
        </Button>
        <div className="flex-1" />
        {toolbarExtra}
        <div role="group" aria-label="Calendar range" className="inline-flex rounded-md border border-border p-0.5">
          {(["month", "week"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "h-6 rounded px-2.5 text-[12.5px] font-medium capitalize",
                mode === m ? "bg-surface-3 text-text" : "text-muted hover:text-text",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
          <div className="flex h-full min-w-[640px] flex-col">
            <div className="grid shrink-0 grid-cols-7 border-b border-border bg-surface text-[11.5px] font-medium text-muted">
              {WEEKDAYS.map((d, i) => (
                <div key={d} className="px-2 py-1.5">
                  {mode === "week" ? `${d} ${format(addDays(weeks[0], i), "d")}` : d}
                </div>
              ))}
            </div>
            <div ref={gridRef} className="flex min-h-0 flex-1 flex-col">
              {weeks.map((weekStart) => {
                const segs = layoutWeek(weekStart, items);
                return (
                  <div
                    key={weekStart.toISOString()}
                    className="relative grid flex-1 grid-cols-7 border-b border-border"
                    style={{ minHeight: MIN_ROW_H }}
                  >
                    {Array.from({ length: 7 }, (_, col) => {
                      const day = addDays(weekStart, col);
                      const iso = toISODate(day)!;
                      const covering = segs.filter((s) => s.startCol <= col && s.startCol + s.span - 1 >= col);
                      const hidden = covering.filter((s) => s.lane >= maxLanes).length;
                      return (
                        <DayCell
                          key={iso}
                          iso={iso}
                          day={day}
                          inMonth={mode === "week" || isSameMonth(day, cursor)}
                          isToday={isSameDay(day, today)}
                          canCreate={canCreate}
                          adding={adding === iso}
                          onStartAdd={() => setAdding(iso)}
                          onFinishAdd={(name) => {
                            setAdding(null);
                            if (name && onCreate) onCreate(iso, name);
                          }}
                          hidden={hidden}
                          moreTop={DAY_HEADER + maxLanes * LANE_H}
                          dayTasks={covering.map((s) => s.task)}
                          onOpenTask={onOpenTask}
                        />
                      );
                    })}
                    <div className="pointer-events-none absolute inset-0">
                      {segs
                        .filter((s) => s.lane < maxLanes)
                        .map((s) => (
                          <TaskChip
                            key={`${s.task.id}@${weekStart.getTime()}`}
                            seg={s}
                            dragId={`${s.task.id}@${weekStart.getTime()}`}
                            draggable={canMove}
                            showAssignee={showAssignee}
                            onOpen={onOpenTask}
                            onGrab={(date) => (grab.current = { taskId: s.task.id, date })}
                          />
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="flex h-5 w-44 cursor-grabbing items-center gap-1 rounded bg-accent px-1.5 text-[12px] text-accent-text shadow-pop">
              <span className="truncate">{dragging.name || "Untitled task"}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function DayCell({
  iso,
  day,
  inMonth,
  isToday,
  canCreate,
  adding,
  onStartAdd,
  onFinishAdd,
  hidden,
  moreTop,
  dayTasks,
  onOpenTask,
}: {
  iso: string;
  day: Date;
  inMonth: boolean;
  isToday: boolean;
  canCreate: boolean;
  adding: boolean;
  onStartAdd: () => void;
  onFinishAdd: (name: string) => void;
  hidden: number;
  moreTop: number;
  dayTasks: CalendarTask[];
  onOpenTask: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  const [draft, setDraft] = useState("");
  // Enter/Escape unmount the input; guard so a trailing blur can't submit twice.
  const finished = useRef(false);
  const finish = (name: string) => {
    if (finished.current) return;
    finished.current = true;
    setDraft("");
    onFinishAdd(name.trim());
  };

  return (
    <div
      ref={setNodeRef}
      onClick={canCreate && !adding ? onStartAdd : undefined}
      className={cn(
        "group/day relative min-w-0 border-r border-border last:border-r-0",
        !inMonth && "bg-surface-2/60",
        isOver && "bg-accent-soft",
        canCreate && "cursor-pointer",
      )}
      aria-label={format(day, "EEEE, MMMM d")}
    >
      <div className="flex h-7 items-center justify-between px-1.5">
        <span
          className={cn(
            "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[12px]",
            isToday ? "bg-accent font-semibold text-accent-text" : inMonth ? "text-text" : "text-faint",
          )}
        >
          {day.getDate() === 1 && !isToday ? format(day, "MMM d") : format(day, "d")}
        </span>
        {canCreate && !adding && (
          <Plus size={13} className="text-faint opacity-0 group-hover/day:opacity-100" aria-hidden />
        )}
      </div>

      {hidden > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="absolute left-1 z-[3] rounded px-1 text-[11.5px] font-medium text-muted hover:bg-surface-3 hover:text-text"
              style={{ top: moreTop }}
            >
              +{hidden} more
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 px-1 text-xs font-semibold text-muted">{format(day, "EEEE, MMM d")}</div>
            <ul className="max-h-72 overflow-y-auto">
              {dayTasks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(t.id)}
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[13px] hover:bg-surface-2"
                  >
                    <ChipIcon task={t} />
                    <span className={cn("truncate", t.completed && "text-faint line-through")}>{t.name || "Untitled task"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}

      {adding && (
        <div className="absolute inset-x-1 bottom-1 z-[4]" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            onFocus={() => (finished.current = false)}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") finish(draft);
              if (e.key === "Escape") finish("");
            }}
            onBlur={() => finish(draft)}
            placeholder="Task name"
            aria-label={`New task due ${format(day, "MMMM d")}`}
            className="h-7 w-full rounded border border-accent bg-surface px-1.5 text-[12.5px] shadow-pop outline-none"
          />
        </div>
      )}
    </div>
  );
}

function ChipIcon({ task }: { task: CalendarTask }) {
  if (task.is_milestone) return <Diamond size={11} className={cn("shrink-0", task.completed ? "fill-current" : "")} />;
  if (task.completed) return <Check size={11} strokeWidth={3} className="shrink-0" />;
  return null;
}

function TaskChip({
  seg,
  dragId,
  draggable,
  showAssignee,
  onOpen,
  onGrab,
}: {
  seg: Seg;
  dragId: string;
  draggable: boolean;
  showAssignee: boolean;
  onOpen: (id: string) => void;
  onGrab: (date: Date) => void;
}) {
  const people = useProfileMap();
  const { task } = seg;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { taskId: task.id },
    disabled: !draggable,
  });
  const assignee = showAssignee && task.assignee_id ? people.get(task.assignee_id) : undefined;
  const name = task.name || "Untitled task";

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onPointerDownCapture={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const col = Math.min(seg.span - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * seg.span)));
        onGrab(addDays(seg.s, col));
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(task.id);
      }}
      title={name}
      className={cn(
        "pointer-events-auto absolute flex h-5 items-center gap-1 overflow-hidden px-1.5 text-left text-[12px] leading-none outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        seg.contL ? "rounded-l-none" : "rounded-l",
        seg.contR ? "rounded-r-none" : "rounded-r",
        task.completed
          ? "bg-surface-3 text-faint"
          : seg.span > 1 || seg.contL || seg.contR
            ? "bg-accent text-accent-text"
            : "bg-accent-soft text-text hover:bg-accent hover:text-accent-text",
        draggable ? "cursor-grab touch-none" : "cursor-pointer",
        isDragging && "opacity-40",
      )}
      style={{
        top: DAY_HEADER + seg.lane * LANE_H,
        left: `calc(${seg.startCol} * 100% / 7 + ${seg.contL ? 0 : 3}px)`,
        width: `calc(${seg.span} * 100% / 7 - ${(seg.contL ? 0 : 3) + (seg.contR ? 0 : 3)}px)`,
      }}
    >
      <ChipIcon task={task} />
      <span className={cn("min-w-0 flex-1 truncate", task.completed && "line-through")}>{name}</span>
      {assignee && <Avatar profile={assignee} size="xs" className="-mr-1 h-4 w-4 text-[8px]" />}
    </button>
  );
}
