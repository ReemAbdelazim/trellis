"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { differenceInCalendarDays, format, isToday, isWeekend, parseISO } from "date-fns";
import { GripVertical, UserX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useProjects } from "@/lib/queries/projects";
import { useUpdateTask, type TaskItem } from "@/lib/queries/tasks";
import { useTaskPane } from "@/lib/task-pane";
import { cn, colorHex, formatDateRange } from "@/lib/utils";
import type { Profile } from "@/types/models";
import { formatValue, heatClass, shiftDate, UNASSIGNED, type Cell, type WorkloadGrid as Grid } from "./workload-model";

export interface WorkloadRow {
  key: string;
  profile?: Profile;
}

interface DragData {
  taskId: string;
  fromPerson: string;
  fromDay: string;
}

const EMPTY: Cell = { tasks: [], value: 0 };

export function WorkloadGrid({
  rows,
  days,
  grid,
  capacity,
  effort,
  tasks,
}: {
  rows: WorkloadRow[];
  days: string[];
  grid: Grid;
  capacity: number;
  effort: boolean;
  tasks: TaskItem[];
}) {
  const update = useUpdateTask();
  const [openCell, setOpenCell] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragData | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const colW = days.length > 14 ? 40 : 60;

  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current as DragData) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    const data = e.active.data.current as DragData | undefined;
    setDragging(null);
    if (!data || !e.over) return;
    const [person, day] = String(e.over.id).split("|");
    const task = taskById.get(data.taskId);
    if (!task || !day) return;
    const delta = differenceInCalendarDays(parseISO(day), parseISO(data.fromDay));
    const assignee = person === UNASSIGNED ? null : person;
    if (delta === 0 && assignee === task.assignee_id) return;
    setOpenCell(null);
    update.mutate({
      id: task.id,
      assignee_id: assignee,
      due_date: shiftDate(task.due_date, delta),
      start_date: shiftDate(task.start_date, delta),
    });
  };

  const draggedTask = dragging ? taskById.get(dragging.taskId) : undefined;
  const template = `minmax(132px, 200px) repeat(${days.length}, ${colW}px) 64px`;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="h-full overflow-auto rounded-lg border border-border bg-surface scrollbar-thin">
        <div className="grid w-max min-w-full" style={{ gridTemplateColumns: template }} role="grid">
          {/* Header */}
          <div className="sticky top-0 left-0 z-30 flex items-end border-b border-r border-border bg-surface px-3 py-2 text-[11px] font-semibold tracking-wide text-faint uppercase">
            Person
          </div>
          {days.map((d) => {
            const date = parseISO(d);
            const today = isToday(date);
            return (
              <div
                key={d}
                role="columnheader"
                className={cn(
                  "sticky top-0 z-20 flex flex-col items-center justify-end border-b border-border bg-surface py-1.5 text-[11px] leading-tight",
                  isWeekend(date) ? "text-faint" : "text-muted",
                  date.getDay() === 1 && "border-l border-l-border-strong",
                )}
              >
                {(date.getDay() === 1 || d === days[0]) && (
                  <span className="text-[10px] font-medium text-faint">{format(date, "MMM")}</span>
                )}
                <span>{format(date, colW < 50 ? "EEEEE" : "EEE")}</span>
                <span
                  className={cn(
                    "mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs tabular-nums",
                    today && "bg-accent font-semibold text-accent-text",
                  )}
                >
                  {format(date, "d")}
                </span>
              </div>
            );
          })}
          <div className="sticky top-0 z-20 flex items-end justify-center border-b border-l border-border bg-surface py-2 text-[11px] font-semibold tracking-wide text-faint uppercase">
            Total
          </div>

          {/* Rows */}
          {rows.map((row) => {
            const cells = grid.get(row.key);
            let total = 0;
            cells?.forEach((c) => (total += c.value));
            return (
              <RowView
                key={row.key}
                row={row}
                days={days}
                cells={cells}
                total={total}
                capacity={capacity}
                effort={effort}
                openCell={openCell}
                setOpenCell={setOpenCell}
                dragging={!!dragging}
              />
            );
          })}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {draggedTask ? <ChipBody task={draggedTask} className="w-56 shadow-pop" /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function RowView({
  row,
  days,
  cells,
  total,
  capacity,
  effort,
  openCell,
  setOpenCell,
  dragging,
}: {
  row: WorkloadRow;
  days: string[];
  cells: Map<string, Cell> | undefined;
  total: number;
  capacity: number;
  effort: boolean;
  openCell: string | null;
  setOpenCell: (k: string | null) => void;
  dragging: boolean;
}) {
  const unassigned = row.key === UNASSIGNED;
  return (
    <>
      <div
        role="rowheader"
        className={cn(
          "sticky left-0 z-10 flex min-w-0 items-center gap-2 border-r border-b border-border bg-surface px-3 py-2",
          unassigned && "bg-surface-2",
        )}
      >
        {unassigned ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-faint">
            <UserX size={12} />
          </span>
        ) : (
          <Avatar profile={row.profile} size="sm" />
        )}
        <span className={cn("truncate text-[13px]", unassigned && "text-muted")}>
          {unassigned ? "Unassigned" : row.profile?.full_name || row.profile?.email || "Unknown"}
        </span>
      </div>
      {days.map((d) => {
        const key = `${row.key}|${d}`;
        return (
          <CellView
            key={key}
            id={key}
            person={row.key}
            day={d}
            cell={cells?.get(d) ?? EMPTY}
            capacity={unassigned ? Infinity : capacity}
            effort={effort}
            open={openCell === key}
            onOpenChange={(o) => setOpenCell(o ? key : null)}
            dragging={dragging}
            muted={unassigned}
          />
        );
      })}
      <div
        className={cn(
          "flex items-center justify-center border-b border-l border-border text-xs text-muted tabular-nums",
          unassigned && "bg-surface-2",
        )}
      >
        {total > 0 ? formatValue(total, effort) : ""}
      </div>
    </>
  );
}

function CellView({
  id,
  person,
  day,
  cell,
  capacity,
  effort,
  open,
  onOpenChange,
  dragging,
  muted,
}: {
  id: string;
  person: string;
  day: string;
  cell: Cell;
  capacity: number;
  effort: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dragging: boolean;
  muted: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const date = parseISO(day);
  const has = cell.tasks.length > 0;
  const heat = muted ? (has ? "bg-surface-3 text-muted" : "") : heatClass(cell.value, capacity);
  const label = has
    ? `${cell.tasks.length} task${cell.tasks.length === 1 ? "" : "s"}${effort ? `, ${formatValue(cell.value, true)}` : ""} on ${format(date, "MMM d")}`
    : `No tasks on ${format(date, "MMM d")}`;

  const button = (
    <button
      type="button"
      aria-label={label}
      disabled={!has}
      onClick={() => onOpenChange(!open)}
      className={cn(
        "m-0.5 flex min-h-8 flex-1 items-center justify-center rounded text-xs tabular-nums transition-colors",
        heat,
        has && "cursor-pointer hover:ring-2 hover:ring-border-strong",
        open && "ring-2 ring-accent",
      )}
    >
      {has ? formatValue(cell.value, effort) : ""}
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex border-b border-border",
        isWeekend(date) && "bg-surface-2/60",
        muted && "bg-surface-2",
        date.getDay() === 1 && "border-l border-l-border-strong",
        isOver && "bg-accent-soft ring-2 ring-accent ring-inset",
      )}
    >
      {open && has ? (
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverAnchor asChild>{button}</PopoverAnchor>
          <PopoverContent
            className={cn("w-72 p-1 transition-opacity", dragging && "pointer-events-none opacity-40")}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-faint uppercase">
              <span>{format(date, "EEE, MMM d")}</span>
              <span className="font-normal normal-case">Drag to reassign or reschedule</span>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto scrollbar-thin">
              {cell.tasks.map((t) => (
                <TaskChip key={t.id} task={t} person={person} day={day} effort={effort} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        button
      )}
    </div>
  );
}

function TaskChip({ task, person, day, effort }: { task: TaskItem; person: string; day: string; effort: boolean }) {
  const { openTask } = useTaskPane();
  const data: DragData = { taskId: task.id, fromPerson: person, fromDay: day };
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: `${task.id}@${person}|${day}`, data });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      onClick={() => openTask(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") openTask(task.id);
      }}
      className={cn("touch-none", isDragging && "opacity-40")}
    >
      <ChipBody task={task} effort={effort} />
    </div>
  );
}

function ChipBody({ task, effort, className }: { task: TaskItem; effort?: boolean; className?: string }) {
  const { data: projects = [] } = useProjects();
  const project = task.project_id ? projects.find((p) => p.id === task.project_id) : undefined;
  return (
    <div
      className={cn(
        "flex cursor-grab items-start gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-left hover:bg-surface-2 active:cursor-grabbing",
        className,
      )}
    >
      <GripVertical size={13} className="mt-0.5 shrink-0 text-faint" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{task.name || "Untitled task"}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-faint">
          {project && (
            <>
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colorHex(project.color) }} />
              <span className="truncate">{project.name}</span>
              <span>·</span>
            </>
          )}
          <span className="shrink-0">{formatDateRange(task.start_date, task.due_date)}</span>
          {effort && task.estimate_hours != null && <span className="shrink-0">· {task.estimate_hours}h</span>}
        </span>
      </span>
    </div>
  );
}
