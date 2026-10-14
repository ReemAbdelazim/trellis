"use client";

import { Calendar, Check, Diamond } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { DatePicker } from "@/components/ui/date-picker";
import { UserPicker } from "@/components/ui/user-picker";
import { useProfile } from "@/lib/queries/people";
import { useUpdateTask } from "@/lib/queries/tasks";
import { cn, DUE_TONE_CLASS, dueTone, formatDateRange } from "@/lib/utils";
import type { Task } from "@/types/models";

/** Round completion checkbox (diamond for milestones). */
export function TaskCheckbox({
  task,
  size = 16,
  disabled,
  className,
}: {
  task: Pick<Task, "id" | "completed" | "is_milestone">;
  size?: number;
  disabled?: boolean;
  className?: string;
}) {
  const update = useUpdateTask();
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    update.mutate({ id: task.id, completed: !task.completed });
  };
  if (task.is_milestone) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
        aria-pressed={task.completed}
        className={cn("flex shrink-0 items-center justify-center", className)}
        style={{ width: size + 2, height: size + 2 }}
      >
        <Diamond
          size={size}
          className={cn(task.completed ? "fill-success text-success" : "text-muted hover:text-success")}
        />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
      aria-pressed={task.completed}
      className={cn(
        "group/check flex shrink-0 items-center justify-center rounded-full border transition-colors",
        task.completed
          ? "border-success bg-success text-white"
          : "border-border-strong text-transparent hover:border-success hover:text-success",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Check size={size - 5} strokeWidth={3} />
    </button>
  );
}

/** Assignee avatar that opens a people picker. */
export function AssigneeButton({
  task,
  disabled,
  showName = false,
  size = "sm",
}: {
  task: Pick<Task, "id" | "assignee_id">;
  disabled?: boolean;
  showName?: boolean;
  size?: "xs" | "sm" | "md";
}) {
  const update = useUpdateTask();
  const assignee = useProfile(task.assignee_id);
  return (
    <UserPicker
      value={task.assignee_id}
      disabled={disabled}
      onChange={(id) => update.mutate({ id: task.id, assignee_id: id })}
    >
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex min-w-0 items-center gap-1.5 rounded-full",
          !disabled && "hover:ring-2 hover:ring-border",
          showName && "pr-2",
        )}
        aria-label={assignee ? `Assigned to ${assignee.full_name}` : "Assign"}
      >
        <Avatar profile={assignee} size={size} />
        {showName && <span className="truncate text-[13px]">{assignee ? assignee.full_name : "Unassigned"}</span>}
      </button>
    </UserPicker>
  );
}

/** Due date label that opens the date picker. */
export function DueDateButton({
  task,
  disabled,
  placeholder = true,
  className,
}: {
  task: Pick<Task, "id" | "due_date" | "start_date" | "completed">;
  disabled?: boolean;
  placeholder?: boolean;
  className?: string;
}) {
  const update = useUpdateTask();
  const tone = dueTone(task.due_date, task.completed);
  const label = formatDateRange(task.start_date, task.due_date);
  return (
    <DatePicker
      due={task.due_date}
      start={task.start_date}
      disabled={disabled}
      onChange={({ due, start }) => update.mutate({ id: task.id, due_date: due, start_date: start })}
    >
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded px-1 text-[12.5px] whitespace-nowrap",
          !disabled && "hover:bg-surface-2",
          label ? DUE_TONE_CLASS[tone] : "text-faint",
          className,
        )}
      >
        {label ? (
          label
        ) : placeholder ? (
          <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus:opacity-100">
            <Calendar size={13} />
          </span>
        ) : null}
      </button>
    </DatePicker>
  );
}
