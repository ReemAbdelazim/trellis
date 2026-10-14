import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
  endOfMonth,
  endOfYear,
  format,
  isWeekend,
  max as maxDate,
  min as minDate,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { toDate, toISODate } from "@/lib/utils";
import type { Task, TaskUpdate } from "@/types/models";

export type Zoom = "days" | "weeks" | "months";

export const ZOOMS: { id: Zoom; label: string }[] = [
  { id: "days", label: "Days" },
  { id: "weeks", label: "Weeks" },
  { id: "months", label: "Months" },
];

/** Horizontal pixels per calendar day at each zoom level. */
export const PX_PER_DAY: Record<Zoom, number> = { days: 36, weeks: 14, months: 4 };

export const ROW_H = 36;
export const HEADER_H = 52;

export type Span = { s: Date; e: Date };

/** Effective [start, end] of a task, inclusive. Tasks with one date are single-day. */
export function taskSpan(t: Pick<Task, "start_date" | "due_date">): Span | null {
  const s = toDate(t.start_date ?? t.due_date);
  const e = toDate(t.due_date ?? t.start_date);
  if (!s || !e) return null;
  return s <= e ? { s, e } : { s: e, e: s };
}

/** Visible date range: earliest - 2 weeks … latest + 2 months, aligned to the zoom's columns. */
export function computeRange(spans: Span[], today: Date, zoom: Zoom) {
  const first = spans.length ? minDate([today, ...spans.map((x) => x.s)]) : today;
  const last = spans.length ? maxDate([today, ...spans.map((x) => x.e)]) : today;
  const rawStart = addDays(first, -14);
  const rawEnd = addDays(last, 62);
  const start = zoom === "months" ? startOfMonth(rawStart) : startOfWeek(rawStart);
  const end = endOfMonth(rawEnd);
  return { start, end, days: differenceInCalendarDays(end, start) + 1 };
}

export type Tick = { key: string; x: number; w: number; label: string; sub?: string; weekend?: boolean; date: Date };

/** Two header tiers plus the column boundaries used for grid lines. */
export function headerTicks(zoom: Zoom, start: Date, end: Date, ppd: number) {
  const x = (d: Date) => differenceInCalendarDays(d, start) * ppd;
  const clipSpan = (from: Date, to: Date) => {
    const a = maxDate([from, start]);
    const b = minDate([to, end]);
    return { x: x(a), w: (differenceInCalendarDays(b, a) + 1) * ppd };
  };

  let top: Tick[];
  let bottom: Tick[];
  if (zoom === "months") {
    top = eachYearOfInterval({ start, end }).map((y) => ({
      key: `y${y.getFullYear()}`,
      ...clipSpan(y, endOfYear(y)),
      label: format(y, "yyyy"),
      date: y,
    }));
    bottom = eachMonthOfInterval({ start, end }).map((m) => ({
      key: `m${toISODate(m)}`,
      ...clipSpan(m, endOfMonth(m)),
      label: format(m, "MMM"),
      date: m,
    }));
  } else {
    top = eachMonthOfInterval({ start, end }).map((m) => ({
      key: `m${toISODate(m)}`,
      ...clipSpan(m, endOfMonth(m)),
      label: format(m, "MMMM yyyy"),
      date: m,
    }));
    bottom =
      zoom === "days"
        ? eachDayOfInterval({ start, end }).map((d) => ({
            key: `d${toISODate(d)}`,
            x: x(d),
            w: ppd,
            label: format(d, "d"),
            sub: format(d, "EEEEE"),
            weekend: isWeekend(d),
            date: d,
          }))
        : eachWeekOfInterval({ start, end }).map((w) => ({
            key: `w${toISODate(w)}`,
            ...clipSpan(w, addDays(w, 6)),
            label: format(w, "MMM d"),
            date: w,
          }));
  }
  return { top, bottom };
}

export type DragMode = "move" | "start" | "end";

/** Apply a day delta to a span for a given drag mode, keeping start <= end. */
export function shiftSpan(span: Span, mode: DragMode, delta: number): Span {
  if (mode === "move") return { s: addDays(span.s, delta), e: addDays(span.e, delta) };
  if (mode === "start") {
    const s = addDays(span.s, delta);
    return { s: s > span.e ? span.e : s, e: span.e };
  }
  const e = addDays(span.e, delta);
  return { s: span.s, e: e < span.s ? span.s : e };
}

/**
 * Turn a new span back into a task patch. Single-day tasks keep only a due date
 * (or only a start date if that's all they had); ranges set both.
 */
export function spanPatch(task: Pick<Task, "start_date" | "due_date">, next: Span): TaskUpdate {
  const s = toISODate(next.s)!;
  const e = toISODate(next.e)!;
  if (s === e) {
    if (!task.due_date && task.start_date) return { start_date: s, due_date: null };
    return { start_date: null, due_date: e };
  }
  return { start_date: s, due_date: e };
}
