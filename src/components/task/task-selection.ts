"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTaskPane } from "@/lib/task-pane";

/** Shift extends a range from the last clicked task; Ctrl/Cmd adds or removes one. */
type SelectGesture = { range: boolean };

function selectGesture(e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): SelectGesture | null {
  if (e.shiftKey) return { range: true };
  if (e.metaKey || e.ctrlKey) return { range: false };
  return null;
}

/**
 * Multi-select over a view's tasks in display order. `order` holds only the tasks
 * that can be selected right now (visible and editable), so tasks that are
 * filtered out, collapsed or deleted drop out of the selection on their own.
 */
export function useTaskSelection(order: string[]) {
  const { taskId: openId, closeTask } = useTaskPane();
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const anchor = useRef<string | null>(null);

  const selected = useMemo(() => order.filter((id) => picked.has(id)), [order, picked]);

  const clear = useCallback(() => {
    anchor.current = null;
    setPicked(new Set());
  }, []);

  const select = (id: string, { range }: SelectGesture) => {
    // The task open in the pane starts a range when no click has yet.
    const start = anchor.current ?? openId;
    const from = start ? order.indexOf(start) : -1;
    const to = order.indexOf(id);
    if (to === -1) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (range && from !== -1) {
        for (const taskId of order.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(taskId);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    // A range extends from where selecting started, so only single picks move the anchor.
    if (!range || from === -1) anchor.current = id;
  };

  /** Every click on a selectable task: modifier clicks select, plain clicks reset and set the range start. */
  const onTaskClick = (id: string, gesture: SelectGesture | null) => {
    if (gesture) {
      select(id, gesture);
      // The pane covers much of the view, so close it once a multi-select starts.
      if (openId) closeTask();
      return;
    }
    if (picked.size) setPicked(new Set());
    anchor.current = id;
  };

  const active = selected.length > 0;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, clear]);

  /** The tasks a drag of `id` moves: the whole selection (in display order) when it includes `id`. */
  const dragGroup = (id: string) => (selected.length > 1 && picked.has(id) ? selected : [id]);

  return { selected, isSelected: (id: string) => picked.has(id), onTaskClick, clear, dragGroup };
}

export type TaskSelection = ReturnType<typeof useTaskSelection>;

export const TaskSelectionContext = createContext<TaskSelection | null>(null);

// Where the current press started: a click that ends a drag isn't a selection click.
let pressedAt: { x: number; y: number } | null = null;
const DRAG_DISTANCE = 5;

/**
 * Makes a task row or card selectable: spread `handlers` on its outermost element.
 * Shift/Ctrl/Cmd-clicks anywhere on it select: they're caught before anything inside
 * sees the click, so they never tick the checkbox or open a picker, and the press
 * doesn't focus a field or highlight text. The press itself still goes through, so
 * a selected group can be dragged with the key held. Outside a selection scope, or
 * when `enabled` is false, it does nothing.
 */
export function useSelectableTask(id: string, enabled = true) {
  const selection = useContext(TaskSelectionContext);
  if (!selection || !enabled) return { selected: false, handlers: {} };

  const selected = selection.isSelected(id);
  return {
    selected,
    handlers: {
      "aria-selected": selected,
      onMouseDownCapture: (e: React.MouseEvent) => {
        pressedAt = { x: e.clientX, y: e.clientY };
        if (selectGesture(e)) e.preventDefault();
      },
      onClickCapture: (e: React.MouseEvent) => {
        const gesture = selectGesture(e);
        const dragged =
          !!pressedAt && Math.hypot(e.clientX - pressedAt.x, e.clientY - pressedAt.y) > DRAG_DISTANCE;
        pressedAt = null;
        if (!dragged) selection.onTaskClick(id, gesture);
        if (gesture) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
    },
  };
}
