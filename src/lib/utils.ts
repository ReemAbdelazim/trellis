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

export const COLOR_HEX: Record<string, string> = {
  teal: "#2a9d8f",
  green: "#3f9c5a",
  lime: "#8ab83a",
  yellow: "#e0b522",
  orange: "#e9853b",
  red: "#d9534f",
  pink: "#e26aa5",
  purple: "#8e63ce",
  indigo: "#5c6bc0",
  blue: "#3a86d4",
  slate: "#748087",
  gray: "#9aa39d",
};

export function colorHex(color?: string | null) {
  return COLOR_HEX[color ?? ""] ?? COLOR_HEX.teal;
}

/** Stable colour for a user id / string. */
export function hashColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return COLOR_HEX[PALETTE[Math.abs(h) % PALETTE.length]];
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
