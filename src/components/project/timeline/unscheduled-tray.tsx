"use client";

import { CalendarOff, GripVertical, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useProfileMap } from "@/lib/queries/people";
import type { TaskItem } from "@/lib/queries/tasks";
import { cn } from "@/lib/utils";

/** MIME type used when dragging an unscheduled task onto the timeline grid. */
export const TASK_DRAG_TYPE = "application/x-trellis-task";

export function UnscheduledTray({
  tasks,
  canEdit,
  onOpen,
  onClose,
}: {
  tasks: TaskItem[];
  canEdit: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const people = useProfileMap();
  return (
    <aside
      className="absolute inset-y-0 right-0 z-30 flex w-64 max-w-[85%] flex-col border-l border-border bg-surface shadow-pop"
      aria-label="Unscheduled tasks"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="flex-1 text-[13px] font-semibold">Unscheduled ({tasks.length})</h2>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close unscheduled tasks">
          <X size={14} />
        </Button>
      </div>
      {canEdit && tasks.length > 0 && (
        <p className="border-b border-border px-3 py-2 text-xs text-muted">
          Drag a task onto the timeline, or click a day in its row, to schedule it.
        </p>
      )}
      <ul className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-1.5">
        {tasks.length === 0 && (
          <li className="flex flex-col items-center gap-2 px-3 py-10 text-center text-sm text-muted">
            <CalendarOff size={20} className="text-faint" />
            Every open task has a date.
          </li>
        )}
        {tasks.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              draggable={canEdit}
              onDragStart={(e) => {
                e.dataTransfer.setData(TASK_DRAG_TYPE, t.id);
                e.dataTransfer.setData("text/plain", t.name);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => onOpen(t.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2",
                canEdit && "cursor-grab active:cursor-grabbing",
              )}
            >
              {canEdit && <GripVertical size={13} className="shrink-0 text-faint" />}
              <span className="min-w-0 flex-1 truncate">{t.name || "Untitled task"}</span>
              {t.assignee_id && <Avatar profile={people.get(t.assignee_id)} size="xs" />}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
