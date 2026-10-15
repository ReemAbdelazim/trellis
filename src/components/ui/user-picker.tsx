"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, UserMinus } from "lucide-react";
import { useActiveProfiles } from "@/lib/queries/people";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Avatar } from "./avatar";
import { cn } from "@/lib/utils";

/** Searchable people picker. `value` is a user id (single) or null. */
export function UserPicker({
  value,
  onChange,
  children,
  allowClear = true,
  disabled,
  filter,
  placeholder = "Search people…",
  align = "start",
}: {
  value: string | null;
  onChange: (userId: string | null) => void;
  children: React.ReactNode;
  allowClear?: boolean;
  disabled?: boolean;
  /** Restrict choices (e.g. to project members). */
  filter?: (userId: string) => boolean;
  placeholder?: string;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  if (disabled) return <>{children}</>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-0" onClick={(e) => e.stopPropagation()}>
        <PeopleList
          selected={value ? [value] : []}
          placeholder={placeholder}
          filter={filter}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
          onClear={
            allowClear && value
              ? () => {
                  onChange(null);
                  setOpen(false);
                }
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}

/** Multi-select people picker (followers, members). Stays open while picking. */
export function MultiUserPicker({
  value,
  onToggle,
  children,
  filter,
  align = "start",
}: {
  value: string[];
  onToggle: (userId: string, selected: boolean) => void;
  children: React.ReactNode;
  filter?: (userId: string) => boolean;
  align?: "start" | "center" | "end";
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-0" onClick={(e) => e.stopPropagation()}>
        <PeopleList selected={value} filter={filter} onPick={(id) => onToggle(id, !value.includes(id))} />
      </PopoverContent>
    </Popover>
  );
}

function PeopleList({
  selected,
  onPick,
  onClear,
  filter,
  placeholder = "Search people…",
}: {
  selected: string[];
  onPick: (id: string) => void;
  onClear?: () => void;
  filter?: (userId: string) => boolean;
  placeholder?: string;
}) {
  const { data: people } = useActiveProfiles();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const activeRow = useRef<HTMLButtonElement>(null);
  // Keep the keyboard-highlighted person visible while arrowing through a long list.
  useEffect(() => activeRow.current?.scrollIntoView({ block: "nearest" }), [active]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people
      .filter((p) => !filter || filter(p.id))
      .filter((p) => !needle || p.full_name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle))
      .slice(0, 50);
  }, [people, q, filter]);

  return (
    <div>
      <div className="border-b border-border p-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.max(0, Math.min(a + 1, list.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && list[active]) {
              e.preventDefault();
              onPick(list[active].id);
            }
          }}
          placeholder={placeholder}
          className="h-8 w-full rounded-md bg-surface-2 px-2 text-sm outline-none placeholder:text-faint"
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-muted hover:bg-surface-2"
          >
            <UserMinus size={15} /> Unassign
          </button>
        )}
        {list.map((p, i) => (
          <button
            type="button"
            key={p.id}
            ref={i === active ? activeRow : undefined}
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(p.id)}
            className={cn(
              "flex h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
              i === active && "bg-surface-2",
            )}
          >
            <Avatar profile={p} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{p.full_name || p.email}</span>
              <span className="block truncate text-[11px] text-faint">
                {p.email}
                {p.role === "guest" && " · Guest"}
              </span>
            </span>
            {selected.includes(p.id) && <Check size={15} className="text-accent" />}
          </button>
        ))}
        {list.length === 0 && <div className="px-2 py-6 text-center text-sm text-faint">No matches</div>}
      </div>
    </div>
  );
}
