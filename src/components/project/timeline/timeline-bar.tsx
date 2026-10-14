"use client";

import { useRef, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Profile, Task, TaskUpdate } from "@/types/models";
import { shiftSpan, spanPatch, type DragMode, type Span } from "./timeline-scale";

type DragState = { mode: DragMode; x0: number; delta: number; moved: boolean };

export interface LinkHandlers {
  start: (fromId: string, e: React.PointerEvent) => void;
  move: (e: React.PointerEvent) => void;
  end: (e: React.PointerEvent) => void;
  cancel: () => void;
}

function rangeLabel(span: Span) {
  const sameDay = differenceInCalendarDays(span.e, span.s) === 0;
  return sameDay ? format(span.s, "MMM d") : `${format(span.s, "MMM d")} – ${format(span.e, "MMM d")}`;
}

/** A draggable / resizable Gantt bar (or a diamond for milestones). */
export function TimelineBar({
  task,
  span,
  rangeStart,
  ppd,
  canEdit,
  assignee,
  conflict,
  onOpen,
  onCommit,
  link,
}: {
  task: Pick<Task, "id" | "name" | "start_date" | "due_date" | "completed" | "is_milestone">;
  span: Span;
  rangeStart: Date;
  ppd: number;
  canEdit: boolean;
  assignee?: Profile;
  conflict: boolean;
  onOpen: (id: string) => void;
  onCommit: (id: string, patch: TaskUpdate) => void;
  link: LinkHandlers;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const suppressClick = useRef(false);

  const view = drag ? shiftSpan(span, drag.mode, drag.delta) : span;
  const left = differenceInCalendarDays(view.s, rangeStart) * ppd;
  const width = Math.max((differenceInCalendarDays(view.e, view.s) + 1) * ppd, 6);
  const name = task.name || "Untitled task";
  const label = `${name}, ${rangeLabel(view)}${task.completed ? ", completed" : ""}${conflict ? ", starts before a blocking task is due" : ""}`;

  const begin = (mode: DragMode) => (e: React.PointerEvent) => {
    if (e.button !== 0 || !canEdit) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ mode, x0: e.clientX, delta: 0, moved: false });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    const moved = drag.moved || Math.abs(dx) > 3;
    const delta = Math.round(dx / ppd);
    if (moved !== drag.moved || delta !== drag.delta) setDrag({ ...drag, moved, delta });
  };

  const onPointerUp = () => {
    if (!drag) return;
    if (drag.moved) {
      suppressClick.current = true;
      if (drag.delta !== 0) onCommit(task.id, spanPatch(task, shiftSpan(span, drag.mode, drag.delta)));
    }
    setDrag(null);
  };

  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onOpen(task.id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(task.id);
      return;
    }
    if (!canEdit || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const delta = e.key === "ArrowLeft" ? -1 : 1;
    const mode: DragMode = e.shiftKey && !task.is_milestone ? "end" : "move";
    onCommit(task.id, spanPatch(task, shiftSpan(span, mode, delta)));
  };

  const linkHandle = canEdit && (
    <span
      role="presentation"
      title="Drag onto another task to make it wait on this one"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        link.start(task.id, e);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        link.move(e);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        link.end(e);
      }}
      onPointerCancel={link.cancel}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-1/2 -right-3.5 hidden h-3 w-3 -translate-y-1/2 cursor-crosshair touch-none rounded-full border-2 border-accent bg-surface group-hover/bar:block group-focus-visible/bar:block"
    />
  );

  const common = {
    "data-task-bar": task.id,
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    title: label,
    onClick,
    onKeyDown,
    onPointerDown: begin("move"),
    onPointerMove,
    onPointerUp,
    onPointerCancel: () => setDrag(null),
  } as const;

  if (task.is_milestone) {
    const size = 16;
    const cx = left + Math.min(width, ppd) / 2;
    return (
      <div
        {...common}
        className={cn(
          "group/bar absolute top-1/2 z-[2] flex -translate-y-1/2 items-center outline-none",
          canEdit ? "cursor-grab touch-none" : "cursor-pointer",
          drag?.moved && "cursor-grabbing",
        )}
        style={{ left: cx - size / 2, height: size }}
      >
        <span
          className={cn(
            "block rotate-45 rounded-[3px] border-2",
            task.completed ? "border-success bg-success" : "border-warning bg-warning-soft",
            conflict && "border-danger",
            "group-focus-visible/bar:ring-2 group-focus-visible/bar:ring-[var(--ring)]",
          )}
          style={{ width: size - 4, height: size - 4 }}
        />
        <span
          className={cn(
            "pointer-events-none ml-2 text-[12.5px] whitespace-nowrap",
            task.completed ? "text-faint line-through" : "text-text",
          )}
        >
          {name}
        </span>
        {linkHandle}
      </div>
    );
  }

  const roomy = width >= 90;
  return (
    <div
      {...common}
      className={cn(
        "group/bar absolute top-1/2 z-[2] flex h-6 -translate-y-1/2 items-center rounded-md text-[12px] shadow-sm outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        task.completed ? "bg-surface-3 text-faint" : "bg-accent text-accent-text",
        conflict && "ring-2 ring-danger",
        canEdit ? "cursor-grab touch-none" : "cursor-pointer",
        drag?.moved && "cursor-grabbing opacity-90",
      )}
      style={{ left, width }}
    >
      {roomy && (
        <span className="pointer-events-none flex min-w-0 items-center gap-1.5 px-1.5">
          {assignee && <Avatar profile={assignee} size="xs" className="ring-1 ring-surface" />}
          <span className={cn("truncate", task.completed && "line-through")}>{name}</span>
        </span>
      )}
      {!roomy && (
        <span
          className={cn(
            "pointer-events-none absolute left-full ml-2 text-[12.5px] whitespace-nowrap",
            task.completed ? "text-faint line-through" : "text-text",
          )}
        >
          {name}
        </span>
      )}
      {canEdit && (
        <>
          <span
            role="presentation"
            onPointerDown={begin("start")}
            className="absolute inset-y-0 left-0 w-2 cursor-ew-resize touch-none rounded-l-md group-hover/bar:bg-black/15"
          />
          <span
            role="presentation"
            onPointerDown={begin("end")}
            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize touch-none rounded-r-md group-hover/bar:bg-black/15"
          />
        </>
      )}
      {drag?.moved && (
        <span className="pointer-events-none absolute -top-6 left-0 rounded bg-surface px-1.5 py-0.5 text-[11px] whitespace-nowrap text-text shadow-pop">
          {rangeLabel(view)}
        </span>
      )}
      {linkHandle}
    </div>
  );
}
