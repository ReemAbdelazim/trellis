"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn, colorHex, COLOR_HEX, PALETTE } from "@/lib/utils";
import { Dialog } from "./dialog";
import { Button } from "./button";
import { STATUS_CLASS, STATUS_LABEL, type StatusColor } from "@/types/models";

export function Spinner({ className, size = 16 }: { className?: string; size?: number }) {
  return <Loader2 size={size} className={cn("animate-spin text-faint", className)} />;
}

export function PageLoader() {
  return (
    <div className="flex h-full min-h-48 items-center justify-center">
      <Spinner size={22} />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium", className)}>
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: StatusColor | null | undefined }) {
  if (!status) return <Pill className="bg-surface-2 text-faint">No status</Pill>;
  return <Pill className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</Pill>;
}

export function ColorDot({ color, className }: { color?: string | null; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-sm", className)} style={{ background: colorHex(color) }} />;
}

export function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{ background: COLOR_HEX[c] }}
        >
          {value === c && <Check size={13} className="text-white" />}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Text that becomes an input on click; commits on blur/Enter, cancels on Escape. */
export function InlineEdit({
  value,
  onSave,
  className,
  inputClassName,
  placeholder,
  disabled,
  autoFocus,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [editing, setEditing] = useState(!!autoFocus);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  // Removing the input fires blur, so Enter/Escape must not commit a second time.
  const finished = useRef(false);

  // Follow external changes to `value` while not editing.
  const [synced, setSynced] = useState(value);
  if (synced !== value && !editing) {
    setSynced(value);
    setDraft(value);
  }

  useEffect(() => {
    if (editing) {
      finished.current = false;
      ref.current?.select();
    }
  }, [editing]);

  const commit = () => {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  };

  if (!editing || disabled) {
    return (
      <span
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? undefined : 0}
        onClick={() => !disabled && setEditing(true)}
        onKeyDown={(e) => e.key === "Enter" && !disabled && setEditing(true)}
        className={cn(
          "block truncate rounded px-1 -mx-1",
          !disabled && "cursor-text hover:bg-surface-2",
          !value && "text-faint",
          className,
        )}
      >
        {value || placeholder}
      </span>
    );
  }
  return (
    <input
      ref={ref}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          finished.current = true;
          setDraft(value);
          setEditing(false);
        }
      }}
      className={cn("w-full rounded border border-accent bg-surface px-1 -mx-1 outline-none", className, inputClassName)}
    />
  );
}

/** Promise-free confirm dialog. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  danger = true,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={pending}>
            {pending && <Spinner size={14} className="text-current" />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <div className="text-sm text-muted">{description}</div>}
    </Dialog>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface-2 px-1 py-px font-sans text-[10px] text-muted">{children}</kbd>
  );
}

export function SectionHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}
