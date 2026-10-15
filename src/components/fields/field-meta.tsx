"use client";

import {
  AlignLeft,
  CalendarDays,
  CheckSquare,
  CircleChevronDown,
  Hash,
  ListChecks,
  Users,
  type LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import { cn, colorHex, toDate } from "@/lib/utils";
import type { Json } from "@/types/database";
import type { CustomField, FieldConfig, FieldOption, FieldType, Profile } from "@/types/models";

export const FIELD_TYPES: { type: FieldType; label: string; icon: LucideIcon; hint: string }[] = [
  { type: "single_select", label: "Single select", icon: CircleChevronDown, hint: "Pick one option, e.g. Priority" },
  { type: "multi_select", label: "Multi select", icon: ListChecks, hint: "Pick several options, e.g. Channels" },
  { type: "text", label: "Text", icon: AlignLeft, hint: "Short free text" },
  { type: "number", label: "Number", icon: Hash, hint: "Amounts, hours, budgets" },
  { type: "date", label: "Date", icon: CalendarDays, hint: "A calendar date" },
  { type: "people", label: "People", icon: Users, hint: "One or more people" },
  { type: "checkbox", label: "Checkbox", icon: CheckSquare, hint: "Yes / no" },
];

export function fieldTypeMeta(type: FieldType) {
  return FIELD_TYPES.find((t) => t.type === type) ?? FIELD_TYPES[2];
}

export function FieldTypeIcon({ type, size = 15, className }: { type: FieldType; size?: number; className?: string }) {
  const Icon = fieldTypeMeta(type).icon;
  return <Icon size={size} className={cn("shrink-0 text-muted", className)} aria-hidden />;
}

export function getFieldConfig(field: Pick<CustomField, "config">): FieldConfig {
  const c = field.config;
  if (!c || typeof c !== "object" || Array.isArray(c)) return {};
  return c as unknown as FieldConfig;
}

export function fieldOptions(field: Pick<CustomField, "config">): FieldOption[] {
  const opts = getFieldConfig(field).options;
  return Array.isArray(opts) ? opts.filter((o) => o && typeof o.id === "string") : [];
}

export const isSelectField = (f: Pick<CustomField, "type">) => f.type === "single_select" || f.type === "multi_select";

// ---------------------------------------------------------------------------
// Value contract: text → string · number → number · checkbox → boolean · date → "yyyy-MM-dd"
// single_select → option id · multi_select → option id[] · people → user id[]
// ---------------------------------------------------------------------------
export const asString = (v: Json | null | undefined) => (typeof v === "string" ? v : null);
export const asNumber = (v: Json | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const asBool = (v: Json | null | undefined) => v === true;
export const asStringArray = (v: Json | null | undefined): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Collapse "empty" values to null so comparisons and storage agree. */
export function normalizeValue(v: Json | null | undefined): Json | null {
  if (v === undefined || v === null || v === "") return null;
  if (Array.isArray(v) && v.length === 0) return null;
  return v;
}

export function valuesEqual(a: Json | null | undefined, b: Json | null | undefined) {
  return JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));
}

/** Currency-ish single symbols read better before the number; words and % go after. */
function unitIsPrefix(unit: string | undefined) {
  return !!unit && unit.length <= 2 && !/[\p{L}\p{N}%]/u.test(unit);
}

export function clampPrecision(p: unknown) {
  return typeof p === "number" && Number.isFinite(p) ? Math.min(6, Math.max(0, Math.round(p))) : 0;
}

export function formatNumber(n: number, config: FieldConfig) {
  const precision = clampPrecision(config.precision);
  const body = n.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision });
  const unit = config.unit?.trim();
  if (!unit) return body;
  return unitIsPrefix(unit) ? (n < 0 ? `-${unit}${body.replace(/^-/, "")}` : `${unit}${body}`) : `${body} ${unit}`;
}

export function formatFieldDate(v: string) {
  const d = toDate(v);
  if (!d || Number.isNaN(d.getTime())) return v;
  return format(d, d.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy");
}

/** Plain-text rendering of a stored value (rule summaries, tooltips). */
export function describeValue(
  field: CustomField,
  value: Json | null | undefined,
  people: Map<string, Pick<Profile, "full_name" | "email">>,
): string {
  const v = normalizeValue(value);
  if (v === null) return "empty";
  switch (field.type) {
    case "text":
      return `“${asString(v) ?? ""}”`;
    case "number": {
      const n = asNumber(v);
      return n === null ? "—" : formatNumber(n, getFieldConfig(field));
    }
    case "date": {
      const s = asString(v);
      return s ? formatFieldDate(s) : "—";
    }
    case "checkbox":
      return asBool(v) ? "checked" : "unchecked";
    case "single_select":
    case "multi_select": {
      const opts = fieldOptions(field);
      const ids = field.type === "single_select" ? [asString(v)].filter(Boolean) : asStringArray(v);
      return ids.map((id) => opts.find((o) => o.id === id)?.name ?? "(removed option)").join(", ") || "—";
    }
    case "people":
      return (
        asStringArray(v)
          .map((id) => {
            const p = people.get(id);
            return p ? p.full_name || p.email : "(unknown person)";
          })
          .join(", ") || "—"
      );
  }
}

/** Solid coloured pill for a select option (white text reads on every palette colour in both themes). */
export function OptionPill({
  option,
  className,
}: {
  option: Pick<FieldOption, "name" | "color">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full min-w-0 shrink-0 items-center rounded-full px-2 text-[11px] font-medium text-white",
        className,
      )}
      style={{ background: colorHex(option.color) }}
      title={option.name}
    >
      <span className="truncate">{option.name || "Untitled"}</span>
    </span>
  );
}

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "h-4 w-7" : "h-5 w-9",
        checked ? "bg-accent" : "bg-surface-3 border border-border-strong",
      )}
    >
      <span
        className={cn(
          "inline-block rounded-full bg-white shadow transition-transform",
          size === "sm" ? "h-3 w-3" : "h-4 w-4",
          checked ? (size === "sm" ? "translate-x-3.5" : "translate-x-[18px]") : "translate-x-0.5",
        )}
      />
    </button>
  );
}
