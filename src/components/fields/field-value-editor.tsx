"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePicker } from "@/components/ui/date-picker";
import { MultiUserPicker } from "@/components/ui/user-picker";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { useProfileMap } from "@/lib/queries/people";
import { cn } from "@/lib/utils";
import type { Json } from "@/types/database";
import type { CustomField } from "@/types/models";
import {
  asBool,
  asNumber,
  asString,
  asStringArray,
  clampPrecision,
  fieldOptions,
  formatFieldDate,
  formatNumber,
  getFieldConfig,
  normalizeValue,
  OptionPill,
  valuesEqual,
} from "./field-meta";

interface EditorProps {
  field: CustomField;
  value: Json | null | undefined;
  onChange: (value: Json | null) => void;
  compact?: boolean;
  disabled?: boolean;
}

/**
 * Renders and edits one custom field value.
 * `compact` = table cell in list views (~32px tall); otherwise a full-width row in the task pane.
 *
 * Value contract (shared with the rules engine): text → string, number → number, checkbox → boolean,
 * date → "yyyy-MM-dd", single_select → option id, multi_select → option id[], people → user id[].
 * `onChange(null)` clears the value. onChange is never called when the value did not change.
 */
export function FieldValueEditor({ field, value, onChange, compact, disabled }: EditorProps) {
  const emit = (next: Json | null) => {
    const n = normalizeValue(next);
    if (!valuesEqual(n, value)) onChange(n);
  };
  const props = { field, value: value ?? null, onChange: emit, compact, disabled };
  switch (field.type) {
    case "text":
      return <TextEditor {...props} />;
    case "number":
      return <NumberEditor {...props} />;
    case "date":
      return <DateEditor {...props} />;
    case "single_select":
      return <SingleSelectEditor {...props} />;
    case "multi_select":
      return <MultiSelectEditor {...props} />;
    case "people":
      return <PeopleEditor {...props} />;
    case "checkbox":
      return <CheckboxEditor {...props} />;
    default:
      return <Empty compact={compact} />;
  }
}

type Props = Omit<EditorProps, "value"> & { value: Json | null };

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
function shell(compact?: boolean, interactive = true) {
  return cn(
    "flex w-full min-w-0 items-center text-left text-[13px]",
    compact ? "h-8 gap-1 px-2" : "-mx-1 min-h-7 gap-1.5 rounded px-1 py-0.5",
    interactive && "cursor-pointer hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
  );
}

function Empty({ compact, label = "—" }: { compact?: boolean; label?: string }) {
  return <span className={cn("truncate text-faint", compact && "text-[13px]")}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
function TextEditor({ value, onChange, compact, disabled }: Props) {
  const current = asString(value) ?? "";
  const [draft, setDraft] = useState(current);
  const [focused, setFocused] = useState(false);
  // Follow external changes while the user isn't typing.
  const [synced, setSynced] = useState(current);
  if (synced !== current && !focused) {
    setSynced(current);
    setDraft(current);
  }
  const skipBlur = useRef(false);
  const atFocus = useRef(current);

  if (disabled) {
    return (
      <div className={shell(compact, false)} title={current || undefined}>
        {current ? <span className="truncate">{current}</span> : <Empty />}
      </div>
    );
  }

  const commit = () => {
    const next = draft.trim();
    setDraft(next);
    if (next === atFocus.current.trim()) return;
    onChange(next ? next : null);
  };

  return (
    <input
      value={draft}
      placeholder={compact ? "" : "Add text…"}
      aria-label="Text value"
      onFocus={() => {
        atFocus.current = current;
        setFocused(true);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        if (skipBlur.current) {
          skipBlur.current = false;
          return;
        }
        commit();
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          skipBlur.current = true;
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(current);
          skipBlur.current = true;
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "w-full min-w-0 bg-transparent text-[13px] text-text outline-none placeholder:text-faint",
        compact
          ? "h-8 px-2 hover:bg-surface-2 focus:bg-surface focus:ring-2 focus:ring-[var(--ring)] focus:ring-inset"
          : "-mx-1 h-7 rounded px-1 hover:bg-surface-2 focus:bg-surface focus:ring-2 focus:ring-[var(--ring)]",
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Number
// ---------------------------------------------------------------------------
function NumberEditor({ field, value, onChange, compact, disabled }: Props) {
  const config = getFieldConfig(field);
  const precision = clampPrecision(config.precision);
  const current = asNumber(value);
  const raw = current === null ? "" : String(current);
  const [draft, setDraft] = useState(raw);
  const [editing, setEditing] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const skipBlur = useRef(false);
  const atFocus = useRef(raw);

  const display = current === null ? "" : formatNumber(current, config);
  const unit = config.unit?.trim();

  if (disabled) {
    return (
      <div className={cn(shell(compact, false), compact && "justify-end tabular-nums")}>
        {display ? <span className="truncate tabular-nums">{display}</span> : <Empty />}
      </div>
    );
  }

  const parse = (s: string): number | null | "invalid" => {
    const cleaned = (unit ? s.split(unit).join("") : s).replace(/[\s,]/g, "");
    if (!cleaned) return null;
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return "invalid";
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return "invalid";
    const f = 10 ** precision;
    return Math.round(n * f) / f;
  };

  const commit = (): boolean => {
    const n = parse(draft);
    if (n === "invalid") {
      setInvalid(true);
      return false;
    }
    setInvalid(false);
    if (draft.trim() !== atFocus.current) onChange(n);
    return true;
  };

  return (
    <div className={cn("relative flex w-full min-w-0 items-center", !compact && "-mx-1")}>
      <input
        value={editing ? draft : display}
        inputMode="decimal"
        placeholder={compact ? "" : unit ? `0 ${unit}` : "Add number…"}
        aria-label="Number value"
        aria-invalid={invalid || undefined}
        title={invalid ? "Enter a valid number" : undefined}
        onFocus={(e) => {
          atFocus.current = raw;
          setDraft(raw);
          setEditing(true);
          setInvalid(false);
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          if (invalid) setInvalid(parse(e.target.value) === "invalid");
        }}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false;
            setEditing(false);
            return;
          }
          if (!commit()) setDraft(raw);
          setInvalid(false);
          setEditing(false);
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            if (commit()) {
              skipBlur.current = true;
              e.currentTarget.blur();
            }
          } else if (e.key === "Escape") {
            setDraft(raw);
            setInvalid(false);
            skipBlur.current = true;
            e.currentTarget.blur();
          }
        }}
        className={cn(
          "w-full min-w-0 bg-transparent text-[13px] text-text tabular-nums outline-none placeholder:text-faint",
          compact
            ? "h-8 px-2 text-right hover:bg-surface-2 focus:bg-surface focus:ring-2 focus:ring-[var(--ring)] focus:ring-inset"
            : "h-7 rounded px-1 hover:bg-surface-2 focus:bg-surface focus:ring-2 focus:ring-[var(--ring)]",
          invalid && "text-danger focus:ring-danger/40",
        )}
      />
      {invalid && !compact && <span className="ml-2 shrink-0 text-[11px] text-danger">Not a number</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------------
function DateEditor({ value, onChange, compact, disabled }: Props) {
  const current = asString(value);
  const label = current ? formatFieldDate(current) : null;
  if (disabled) {
    return <div className={shell(compact, false)}>{label ? <span className="truncate">{label}</span> : <Empty />}</div>;
  }
  return (
    <div className="group/date flex w-full min-w-0 items-center">
      <DatePicker due={current} allowStart={false} onChange={({ due }) => onChange(due)}>
        <button type="button" className={shell(compact)} onClick={(e) => e.stopPropagation()}>
          {label ? <span className="truncate">{label}</span> : <Empty label={compact ? "" : "Add date"} />}
        </button>
      </DatePicker>
      {current && (
        <ClearButton onClear={() => onChange(null)} className="opacity-0 group-hover/date:opacity-100 focus:opacity-100" />
      )}
    </div>
  );
}

function ClearButton({ onClear, className }: { onClear: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Clear value"
      onClick={(e) => {
        e.stopPropagation();
        onClear();
      }}
      className={cn("mr-1 shrink-0 rounded p-0.5 text-faint hover:bg-surface-3 hover:text-text", className)}
    >
      <X size={12} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Single select
// ---------------------------------------------------------------------------
function SingleSelectEditor({ field, value, onChange, compact, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const options = fieldOptions(field);
  const selected = options.find((o) => o.id === asString(value)) ?? null;
  const body = selected ? <OptionPill option={selected} /> : <Empty label={compact || disabled ? "—" : "Select…"} />;

  if (disabled) return <div className={shell(compact, false)}>{body}</div>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={shell(compact)} onClick={(e) => e.stopPropagation()}>
          {body}
          {!compact && <ChevronDown size={13} className="ml-auto shrink-0 text-faint" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" onClick={(e) => e.stopPropagation()}>
        <div className="max-h-72 overflow-y-auto scrollbar-thin" role="listbox" aria-label={field.name}>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === selected?.id}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
            >
              <OptionPill option={o} />
              {o.id === selected?.id && <Check size={14} className="ml-auto shrink-0 text-accent" />}
            </button>
          ))}
          {options.length === 0 && <div className="px-2 py-4 text-center text-[13px] text-faint">No options yet</div>}
        </div>
        {selected && (
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted hover:bg-surface-2"
            >
              <X size={14} /> Clear
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Multi select
// ---------------------------------------------------------------------------
function MultiSelectEditor({ field, value, onChange, compact, disabled }: Props) {
  const options = fieldOptions(field);
  const ids = asStringArray(value);
  // Keep the option order (not pick order) and drop ids of removed options.
  const selected = options.filter((o) => ids.includes(o.id));
  const max = compact ? 2 : 4;
  const shown = selected.slice(0, max);
  const extra = selected.length - shown.length;

  const body =
    selected.length === 0 ? (
      <Empty label={compact || disabled ? "—" : "Select…"} />
    ) : (
      <span className="flex min-w-0 items-center gap-1 overflow-hidden" title={selected.map((o) => o.name).join(", ")}>
        {shown.map((o) => (
          <OptionPill key={o.id} option={o} className="max-w-[9rem] shrink" />
        ))}
        {extra > 0 && <span className="shrink-0 text-[11px] font-medium text-muted">+{extra}</span>}
      </span>
    );

  if (disabled) return <div className={shell(compact, false)}>{body}</div>;

  const toggle = (id: string) => {
    const set = new Set(selected.map((o) => o.id));
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange(options.filter((o) => set.has(o.id)).map((o) => o.id));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={shell(compact)} onClick={(e) => e.stopPropagation()}>
          {body}
          {!compact && <ChevronDown size={13} className="ml-auto shrink-0 text-faint" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" onClick={(e) => e.stopPropagation()}>
        <div className="max-h-72 overflow-y-auto scrollbar-thin" role="group" aria-label={field.name}>
          {options.map((o) => {
            const on = ids.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(o.id)}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    on ? "border-accent bg-accent text-accent-text" : "border-border-strong",
                  )}
                >
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                <OptionPill option={o} />
              </button>
            );
          })}
          {options.length === 0 && <div className="px-2 py-4 text-center text-[13px] text-faint">No options yet</div>}
        </div>
        {selected.length > 0 && (
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={() => onChange(null)}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-muted hover:bg-surface-2"
            >
              <X size={14} /> Clear all
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
function PeopleEditor({ value, onChange, compact, disabled }: Props) {
  const people = useProfileMap();
  const ids = asStringArray(value);
  const profiles = ids.map((id) => people.get(id));
  const known = profiles.filter(Boolean);
  const names = known.map((p) => p!.full_name || p!.email).join(", ");

  const body =
    ids.length === 0 ? (
      <Empty label={compact || disabled ? "—" : "Add people"} />
    ) : ids.length === 1 && known[0] && !compact ? (
      <span className="flex min-w-0 items-center gap-1.5">
        <Avatar profile={known[0]} size="xs" />
        <span className="truncate">{known[0].full_name || known[0].email}</span>
      </span>
    ) : (
      <span className="flex min-w-0 items-center gap-1.5" title={names}>
        <AvatarStack profiles={profiles} size="xs" max={compact ? 3 : 5} />
        {!compact && ids.length > 1 && <span className="truncate text-muted">{ids.length} people</span>}
      </span>
    );

  if (disabled) return <div className={shell(compact, false)}>{body}</div>;

  return (
    <MultiUserPicker
      value={ids}
      onToggle={(id, on) => onChange(on ? [...ids.filter((x) => x !== id), id] : ids.filter((x) => x !== id))}
    >
      <button type="button" className={shell(compact)} onClick={(e) => e.stopPropagation()}>
        {body}
      </button>
    </MultiUserPicker>
  );
}

// ---------------------------------------------------------------------------
// Checkbox
// ---------------------------------------------------------------------------
function CheckboxEditor({ field, value, onChange, compact, disabled }: Props) {
  const on = asBool(value);
  return (
    <div className={cn(shell(compact, false), compact && "justify-center")}>
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={field.name}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onChange(!on);
        }}
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
          on ? "border-accent bg-accent text-accent-text" : "border-border-strong bg-surface hover:border-accent",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
          disabled && "cursor-default opacity-70 hover:border-border-strong",
        )}
      >
        {on && <Check size={11} strokeWidth={3} />}
      </button>
    </div>
  );
}
