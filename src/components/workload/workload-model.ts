import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { toISODate } from "@/lib/utils";
import type { TaskItem } from "@/lib/queries/tasks";

export const UNASSIGNED = "__unassigned";

export interface Cell {
  /** Tasks contributing to this cell. */
  tasks: TaskItem[];
  /** Task count, or hours in effort mode. */
  value: number;
}

export type WorkloadGrid = Map<string, Map<string, Cell>>;

/**
 * Bucket tasks into person × day cells.
 * - count mode: each incomplete task counts 1 on its due date.
 * - effort mode: estimate_hours on the due date, or spread evenly over start→due (inclusive).
 */
export function buildWorkload(tasks: TaskItem[], days: string[], effort: boolean): WorkloadGrid {
  const grid: WorkloadGrid = new Map();
  if (days.length === 0) return grid;
  const inWindow = new Set(days);
  const windowStart = parseISO(days[0]);
  const windowEnd = parseISO(days[days.length - 1]);

  const add = (person: string, day: string, task: TaskItem, value: number) => {
    let row = grid.get(person);
    if (!row) grid.set(person, (row = new Map()));
    const cell = row.get(day) ?? { tasks: [], value: 0 };
    cell.tasks.push(task);
    cell.value += value;
    row.set(day, cell);
  };

  for (const t of tasks) {
    if (t.completed || !t.due_date) continue;
    const person = t.assignee_id ?? UNASSIGNED;
    if (!effort) {
      if (inWindow.has(t.due_date)) add(person, t.due_date, t, 1);
      continue;
    }
    const hours = Number(t.estimate_hours ?? 0) || 0;
    const due = parseISO(t.due_date);
    const start = t.start_date ? parseISO(t.start_date) : null;
    if (start && start < due) {
      const span = differenceInCalendarDays(due, start) + 1;
      const perDay = hours / span;
      const from = start < windowStart ? windowStart : start;
      const to = due > windowEnd ? windowEnd : due;
      for (let d = from; d <= to; d = addDays(d, 1)) add(person, toISODate(d)!, t, perDay);
    } else if (inWindow.has(t.due_date)) {
      add(person, t.due_date, t, hours);
    }
  }
  return grid;
}

/** Background/text classes for a load relative to capacity. */
export function heatClass(value: number, capacity: number) {
  if (value <= 0) return "";
  const ratio = capacity > 0 ? value / capacity : 2;
  if (ratio > 1.5) return "bg-danger/45 text-danger font-semibold";
  if (ratio > 1) return "bg-danger/25 text-danger font-semibold";
  if (ratio > 0.85) return "bg-accent/55 text-text font-medium";
  if (ratio > 0.5) return "bg-accent/35 text-text";
  return "bg-accent/15 text-text";
}

export function formatValue(value: number, effort: boolean) {
  if (!effort) return String(value);
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}h`;
}

/** Shift an optional date string by whole days. */
export function shiftDate(value: string | null, days: number) {
  return value ? toISODate(addDays(parseISO(value), days)) : null;
}
