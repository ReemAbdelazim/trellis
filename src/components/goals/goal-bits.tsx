"use client";

import { useRef, useState } from "react";
import { ProgressBar } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/** Progress bar with a percentage label. */
export function GoalProgress({ value, className }: { value: number; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ProgressBar value={pct} className="flex-1" />
      <span className="w-9 shrink-0 text-right text-xs text-muted tabular-nums">{pct}%</span>
    </div>
  );
}

/** Number input that commits on blur / Enter and follows external changes while idle. */
export function NumberField({
  value,
  onCommit,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const [synced, setSynced] = useState(value);
  const cancelled = useRef(false);
  if (synced !== value && !focused) {
    setSynced(value);
    setDraft(String(value));
  }
  const commit = () => {
    setFocused(false);
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(String(value));
      return;
    }
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    if (n !== Number(value)) onCommit(n);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      step="any"
      aria-label={ariaLabel}
      disabled={disabled}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "h-8 w-full rounded-md border border-border bg-surface px-2 text-sm tabular-nums text-text",
        "focus:border-accent focus:ring-2 focus:ring-[var(--ring)] focus:outline-none disabled:opacity-60",
        className,
      )}
    />
  );
}
