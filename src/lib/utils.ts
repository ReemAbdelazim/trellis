import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  differenceInCalendarDays,
  format,
  isThisYear,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
} from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Fractional ordering: a position strictly between two neighbours. */
export function positionBetween(before?: number | null, after?: number | null): number {
  if (before == null && after == null) return 1000;
  if (before == null) return (after as number) - 1000;
  if (after == null) return before + 1000;
  return (before + after) / 2;
}

/**
 * New positions for putting `ids` (in that order) at `index` of `ordered`, a list
 * that doesn't contain them yet. They are spaced between their new neighbours when
 * there is room; otherwise the whole list is renumbered. Returns every id whose
 * position changes, always including `ids`.
 */
export function placeAt<T extends { id: string }>(
  ordered: T[],
  ids: string[],
  index: number,
  positionOf: (item: T) => number,
): { id: string; position: number }[] {
  const lo = index > 0 ? positionOf(ordered[index - 1]) : null;
  const hi = index < ordered.length ? positionOf(ordered[index]) : null;
  const n = ids.length;
  let fitted: number[];
  if (lo == null && hi == null) fitted = ids.map((_, i) => (i + 1) * 1000);
  else if (hi == null) fitted = ids.map((_, i) => (lo as number) + (i + 1) * 1000);
  else if (lo == null) fitted = ids.map((_, i) => hi - (n - i) * 1000);
  else fitted = ids.map((_, i) => lo + ((hi - lo) * (i + 1)) / (n + 1));
  const fits =
    fitted.every(Number.isFinite) &&
    fitted.every((p, i) => (i === 0 ? lo == null || lo < p : fitted[i - 1] < p)) &&
    (hi == null || fitted[n - 1] < hi);
  if (fits) return ids.map((id, i) => ({ id, position: fitted[i] }));

  // No room (neighbours share a position): renumber everything in the new order.
  const moving = new Set(ids);
  const full = [...ordered.slice(0, index).map((t) => t.id), ...ids, ...ordered.slice(index).map((t) => t.id)];
  const current = new Map(ordered.map((t) => [t.id, positionOf(t)]));
  return full
    .map((id, i) => ({ id, position: (i + 1) * 1000 }))
    .filter(({ id, position }) => moving.has(id) || current.get(id) !== position);
}

/** Position for appending after a list of items with `position`. */
export function nextPosition(items: { position: number }[]): number {
  return items.length ? Math.max(...items.map((i) => i.position)) + 1000 : 1000;
}

export function initials(name?: string | null, email?: string | null) {
  const source = (name || email || "?").trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export const PALETTE = [
  "teal",
  "green",
  "lime",
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
  "indigo",
  "blue",
  "slate",
] as const;
export type PaletteColor = (typeof PALETTE)[number];

/**
 * Muted but bright, like Asana's palette. Each is as light as it can be while
 * white text still reads on it (3:1); the light ones (yellow, lime, orange,
 * gray) get dark text instead — see colorFill.
 */
export const COLOR_HEX: Record<string, string> = {
  teal: "#20a598",
  green: "#3ea36b",
  lime: "#a3cc55",
  yellow: "#f4c84b",
  orange: "#ec7e4f",
  red: "#e55a5a",
  pink: "#e45f9f",
  purple: "#9c6ad8",
  indigo: "#6c74e0",
  blue: "#3f86e0",
  slate: "#738190",
  gray: "#8f9893",
};

export function colorHex(color?: string | null) {
  return COLOR_HEX[color ?? ""] ?? COLOR_HEX.teal;
}

const DARK_INK = "#1e2420";

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** White where it reads on the colour (3:1, enough for icons and bold labels), dark ink otherwise. */
const INK: Record<string, string> = Object.fromEntries(
  Object.entries(COLOR_HEX).map(([name, hex]) => [name, 1.05 / (luminance(hex) + 0.05) >= 3 ? "#ffffff" : DARK_INK]),
);

/** Style for a palette-coloured tile, pill or avatar: the colour plus text that stays readable on it. */
export function colorFill(color?: string | null): { background: string; color: string } {
  const name = color && COLOR_HEX[color] ? color : "teal";
  return { background: COLOR_HEX[name], color: INK[name] };
}

/** Stable palette colour for a string (a user id, a tag name…). */
export function paletteColorFor(seed: string): PaletteColor {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}


export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  return typeof value === "string" ? parseISO(value) : value;
}

/** yyyy-MM-dd for a Postgres `date`. */
export function toISODate(d: Date | null | undefined): string | null {
  return d ? format(d, "yyyy-MM-dd") : null;
}

export function formatDue(value: string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  const diff = differenceInCalendarDays(d, new Date());
  if (diff > 1 && diff < 7) return format(d, "EEEE");
  return isThisYear(d) ? format(d, "MMM d") : format(d, "MMM d, yyyy");
}

export function formatDateRange(start: string | null | undefined, due: string | null | undefined) {
  if (start && due) return `${formatDue(start)} – ${formatDue(due)}`;
  return formatDue(due ?? start);
}

export type DueTone = "overdue" | "today" | "soon" | "normal" | "done";

export function dueTone(value: string | null | undefined, completed = false): DueTone {
  const d = toDate(value);
  if (!d) return "normal";
  if (completed) return "done";
  const diff = differenceInCalendarDays(d, new Date());
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 2) return "soon";
  return "normal";
}

export const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: "text-danger",
  today: "text-success",
  soon: "text-success",
  normal: "text-muted",
  done: "text-faint",
};

export function timeAgo(value: string | Date) {
  const d = typeof value === "string" ? parseISO(value) : value;
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return isThisYear(d) ? format(d, "MMM d") : format(d, "MMM d, yyyy");
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function errorMessage(err: unknown): string {
  if (!err) return "Something went wrong";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "Something went wrong";
}
