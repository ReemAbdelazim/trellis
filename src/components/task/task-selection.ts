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

  return { selected, isSelected: (id: string) => picked.has(id), onTaskClick, clear };
}

export type TaskSelection = ReturnType<typeof useTaskSelection>;

export const TaskSelectionContext = createContext<TaskSelection | null>(null);

/**
 * Makes a task row or card selectable: spread `handlers` on its outermost element.
 * Modifier presses are caught before anything inside sees them, so a Shift/Ctrl/Cmd-click
 * anywhere on it selects: it never ticks the checkbox, opens a picker, starts a drag,
 * focuses a field or highlights text. Outside a selection scope, or when `enabled` is
 * false, it does nothing.
 */
export function useSelectableTask(id: string, enabled = true) {
  const selection = useContext(TaskSelectionContext);
  if (!selection || !enabled) return { selected: false, handlers: {} };

  const claim = (e: React.MouseEvent) => {
    if (selectGesture(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const selected = selection.isSelected(id);
  return {
    selected,
    handlers: {
      "aria-selected": selected,
      onPointerDownCapture: claim,
      onMouseDownCapture: claim,
      onClickCapture: (e: React.MouseEvent) => {
        const gesture = selectGesture(e);
        selection.onTaskClick(id, gesture);
        if (gesture) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
    },
  };
}
