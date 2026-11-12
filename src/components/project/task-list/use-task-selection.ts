"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SelectGesture = { range: boolean; toggle: boolean };

/** Read the selection gesture off a click: Shift selects a range, Ctrl/Cmd adds or removes one. */
export function selectGesture(e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): SelectGesture | null {
  if (e.shiftKey) return { range: true, toggle: false };
  if (e.metaKey || e.ctrlKey) return { range: false, toggle: true };
  return null;
}

/**
 * Multi-select over a list of rows in display order. `order` holds only the rows
 * that can be selected right now (visible and editable), so tasks that are
 * filtered out, collapsed or deleted drop out of the selection on their own.
 * `openId` (the task in the pane) starts a Shift-click range when nothing else has.
 */
export function useTaskSelection(order: string[], openId: string | null = null) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const anchor = useRef<string | null>(null);

  const selected = useMemo(() => order.filter((id) => picked.has(id)), [order, picked]);

  const clear = useCallback(() => {
    anchor.current = null;
    setPicked(new Set());
  }, []);

  const select = (id: string, { range }: SelectGesture) => {
    const start = anchor.current ?? openId;
    const from = start ? order.indexOf(start) : -1;
    const to = order.indexOf(id);
    if (to === -1) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (range && from !== -1) {
        for (const rowId of order.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(rowId);
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

  /** Shift/Ctrl/Cmd-clicks select; a plain click drops the selection and starts the next range there. */
  const onRowClick = (id: string, gesture: SelectGesture | null) => {
    if (gesture) return select(id, gesture);
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

  return { selected, isSelected: (id: string) => picked.has(id), onRowClick, clear };
}
