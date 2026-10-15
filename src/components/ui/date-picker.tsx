"use client";

import { useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  nextMonday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, toDate, toISODate } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Button } from "./button";

function Calendar({
  value,
  onSelect,
  rangeStart,
}: {
  value: Date | null;
  onSelect: (d: Date) => void;
  rangeStart?: Date | null;
}) {
  const [month, setMonth] = useState(() => startOfMonth(value ?? new Date()));
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });
  return (
    <div className="w-[252px] select-none">
      <div className="mb-2 flex items-center justify-between">
        <Button size="icon-sm" variant="ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
          <ChevronLeft size={14} />
        </Button>
        <span className="text-sm font-medium">{format(month, "MMMM yyyy")}</span>
        <Button size="icon-sm" variant="ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
          <ChevronRight size={14} />
        </Button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-faint">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((d) => {
          const selected = value && isSameDay(d, value);
          const inRange = rangeStart && value && d > rangeStart && d < value;
          const isStart = rangeStart && isSameDay(d, rangeStart);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onSelect(d)}
              className={cn(
                "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[13px] hover:bg-surface-2",
                !isSameMonth(d, month) && "text-faint",
                isToday(d) && !selected && "font-semibold text-accent",
                inRange && "rounded-none bg-accent-soft",
                (selected || isStart) && "bg-accent text-accent-text hover:bg-accent-hover",
              )}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Due date (and optional start date) picker.
 * Values are Postgres `date` strings (yyyy-MM-dd) or null.
 */
export function DatePicker({
  due,
  start,
  onChange,
  allowStart = true,
  children,
  disabled,
  align = "start",
}: {
  due: string | null;
  start?: string | null;
  onChange: (next: { due: string | null; start: string | null }) => void;
  allowStart?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<"due" | "start">("due");
  const [showStart, setShowStart] = useState(Boolean(start));
  const dueDate = toDate(due);
  const startDate = toDate(start ?? null);

  const pick = (d: Date) => {
    if (editing === "start") {
      const nextStart = toISODate(d);
      const nextDue = dueDate && d > dueDate ? nextStart : due;
      onChange({ start: nextStart, due: nextDue });
      setEditing("due");
    } else {
      const nextDue = toISODate(d);
      const nextStart = startDate && startDate > d ? null : (start ?? null);
      onChange({ due: nextDue, start: nextStart });
      setOpen(false);
    }
  };

  const quick = (d: Date | null) => {
    const keepStart = d && startDate && startDate <= d;
    onChange({ due: toISODate(d), start: keepStart ? (start ?? null) : null });
    setOpen(false);
  };

  if (disabled) return <>{children}</>;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setEditing("due");
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="p-3" onClick={(e) => e.stopPropagation()}>
        {allowStart && (
          <div className="mb-3 flex gap-2 text-xs">
            {showStart ? (
              <button
                type="button"
                onClick={() => setEditing("start")}
                className={cn(
                  "flex-1 rounded-md border px-2 py-1.5 text-left",
                  editing === "start" ? "border-accent" : "border-border",
                )}
              >
                <div className="text-faint">Start</div>
                <div>{startDate ? format(startDate, "MMM d") : "—"}</div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowStart(true);
                  setEditing("start");
                }}
                className="rounded-md border border-dashed border-border px-2 py-1.5 text-muted hover:text-text"
              >
                + Start date
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing("due")}
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 text-left",
                editing === "due" ? "border-accent" : "border-border",
              )}
            >
              <div className="text-faint">Due</div>
              <div>{dueDate ? format(dueDate, "MMM d") : "—"}</div>
            </button>
          </div>
        )}
        <Calendar
          key={editing}
          value={editing === "start" ? startDate : dueDate}
          rangeStart={editing === "due" ? startDate : null}
          onSelect={pick}
        />
        <div className="mt-3 flex flex-wrap gap-1 border-t border-border pt-2">
          <Button size="xs" variant="ghost" onClick={() => quick(new Date())}>
            Today
          </Button>
          <Button size="xs" variant="ghost" onClick={() => quick(addDays(new Date(), 1))}>
            Tomorrow
          </Button>
          <Button size="xs" variant="ghost" onClick={() => quick(nextMonday(new Date()))}>
            Next week
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto text-danger"
            onClick={() => {
              onChange({ due: null, start: null });
              setShowStart(false);
              setOpen(false);
            }}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
