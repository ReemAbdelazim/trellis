"use client";

import { useState } from "react";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { TaskCheckbox } from "@/components/task/task-bits";
import type { TaskItem } from "@/lib/queries/tasks";
import { cn } from "@/lib/utils";
import type { Profile, TaskUpdate } from "@/types/models";
import { ROW_H, type Span } from "./timeline-scale";
import { TimelineBar, type LinkHandlers } from "./timeline-bar";

/** Collapsible section header row with a summary bar of its tasks' date span. */
export function TimelineSectionRow({
  name,
  count,
  collapsed,
  onToggle,
  summary,
  rangeStart,
  ppd,
  leftW,
  gridW,
}: {
  name: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  summary: Span | null;
  rangeStart: Date;
  ppd: number;
  leftW: number;
  gridW: number;
}) {
  return (
    <div className="flex border-b border-border" style={{ height: ROW_H }}>
      <div
        className="sticky left-0 z-[5] flex h-full shrink-0 items-center border-r border-border bg-surface px-1.5"
        style={{ width: leftW }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-1 text-left text-[13px] font-semibold hover:bg-surface-2"
        >
          {collapsed ? <ChevronRight size={14} className="shrink-0 text-muted" /> : <ChevronDown size={14} className="shrink-0 text-muted" />}
          <span className="truncate">{name}</span>
          <span className="ml-1 shrink-0 text-xs font-normal text-faint">{count}</span>
        </button>
      </div>
      <div className="relative h-full" style={{ width: gridW }}>
        {summary && (
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border-strong"
            style={{
              left: differenceInCalendarDays(summary.s, rangeStart) * ppd,
              width: Math.max((differenceInCalendarDays(summary.e, summary.s) + 1) * ppd, 4),
            }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

/** One task: sticky name cell on the left, bar (or click-to-schedule area) on the right. */
export function TimelineTaskRow({
  task,
  span,
  assignee,
  conflict,
  rangeStart,
  ppd,
  leftW,
  gridW,
  canEdit,
  onOpen,
  onCommit,
  link,
}: {
  task: TaskItem;
  span: Span | null;
  assignee?: Profile;
  conflict: boolean;
  rangeStart: Date;
  ppd: number;
  leftW: number;
  gridW: number;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onCommit: (id: string, patch: TaskUpdate) => void;
  link: LinkHandlers;
}) {
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const schedulable = !span && canEdit;
  const dayAt = (e: React.MouseEvent<HTMLDivElement>) =>
    Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / ppd);

  return (
    <div className="group/row flex border-b border-border/60 hover:bg-surface-2/40" style={{ height: ROW_H }}>
      <div
        className="sticky left-0 z-[5] flex h-full shrink-0 items-center gap-2 border-r border-border bg-surface pr-2 pl-3 group-hover/row:bg-surface-2"
        style={{ width: leftW }}
      >
        <TaskCheckbox task={task} size={14} disabled={!canEdit} />
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          className={cn(
            "min-w-0 flex-1 truncate text-left text-[13px] hover:underline",
            task.completed && "text-faint line-through",
            !task.name && "text-faint",
          )}
        >
          {task.name || "Untitled task"}
        </button>
        {assignee && <Avatar profile={assignee} size="xs" tooltip />}
      </div>
      <div
        className={cn("relative h-full", schedulable && "cursor-pointer")}
        style={{ width: gridW }}
        onMouseMove={schedulable ? (e) => setHoverDay(dayAt(e)) : undefined}
        onMouseLeave={schedulable ? () => setHoverDay(null) : undefined}
        onClick={
          schedulable
            ? (e) => {
                const day = dayAt(e);
                if (day >= 0) onCommit(task.id, { due_date: format(addDays(rangeStart, day), "yyyy-MM-dd"), start_date: null });
              }
            : undefined
        }
        title={schedulable ? "Click a day to schedule this task" : undefined}
      >
        {span ? (
          <TimelineBar
            task={task}
            span={span}
            rangeStart={rangeStart}
            ppd={ppd}
            canEdit={canEdit}
            assignee={assignee}
            conflict={conflict}
            onOpen={onOpen}
            onCommit={onCommit}
            link={link}
          />
        ) : (
          schedulable &&
          hoverDay !== null && (
            <div
              className="pointer-events-none absolute top-1/2 flex h-6 -translate-y-1/2 items-center rounded-md border border-dashed border-accent bg-accent-soft"
              style={{ left: hoverDay * ppd, width: Math.max(ppd, 6) }}
            >
              <span className="absolute left-full ml-2 text-[11.5px] whitespace-nowrap text-muted">
                {format(addDays(rangeStart, hoverDay), "MMM d")}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
