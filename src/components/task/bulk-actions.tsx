"use client";

import { useState } from "react";
import { Tag as TagIcon, Trash2, UserRound, X } from "lucide-react";
import { useDeleteTasks, useUpdateTasks, type TaskItem } from "@/lib/queries/tasks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/misc";
import { UserPicker } from "@/components/ui/user-picker";
import { TagPicker } from "@/components/tags/task-tags";
import { TaskSelectionContext, type TaskSelection } from "./task-selection";

/**
 * Makes the tasks inside selectable (see useSelectableTask) and shows the bulk
 * actions bar while any are selected. Put it inside a `relative` container.
 */
export function TaskSelectionScope({
  selection,
  tasksById,
  children,
}: {
  selection: TaskSelection;
  tasksById: ReadonlyMap<string, TaskItem>;
  children: React.ReactNode;
}) {
  const tasks = selection.selected.map((id) => tasksById.get(id)).filter((t): t is TaskItem => !!t);
  return (
    <TaskSelectionContext.Provider value={selection}>
      {children}
      {tasks.length > 0 && <BulkActionsBar tasks={tasks} onClear={selection.clear} />}
    </TaskSelectionContext.Provider>
  );
}

/** Wraps a drag preview with the number of tasks it moves, when it moves more than one. */
export function DragCount({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      {count > 1 && (
        <span
          aria-label={`Moving ${count} tasks`}
          className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white tabular-nums shadow-pop"
        >
          {count}
        </span>
      )}
    </div>
  );
}

/** Floating bar for the selected tasks: reassign, tag or delete them together. */
function BulkActionsBar({ tasks, onClear }: { tasks: TaskItem[]; onClear: () => void }) {
  const update = useUpdateTasks();
  const del = useDeleteTasks();
  const [confirming, setConfirming] = useState(false);
  const ids = tasks.map((t) => t.id);
  const count = tasks.length;
  const noun = count === 1 ? "task" : "tasks";
  const subtasks = tasks.reduce((n, t) => n + t.subtask_count, 0);

  return (
    <>
      <div
        role="toolbar"
        data-bulk-actions
        aria-label={`${count} ${noun} selected`}
        className="absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-surface p-1.5 shadow-pop"
      >
        <span className="px-2 text-[13px] font-medium whitespace-nowrap tabular-nums">
          {count} selected
        </span>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <UserPicker value={null} align="center" onChange={(assignee_id) => update.mutate({ ids, patch: { assignee_id } })}>
          <Button variant="ghost" size="sm" aria-label={`Assign ${count} ${noun}`}>
            <UserRound size={15} /> <span className="hidden sm:inline">Assign</span>
          </Button>
        </UserPicker>
        <TagPicker tasks={tasks} align="center">
          <Button variant="ghost" size="sm" aria-label={`Tag ${count} ${noun}`}>
            <TagIcon size={15} /> <span className="hidden sm:inline">Tag</span>
          </Button>
        </TagPicker>
        <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirming(true)} aria-label={`Delete ${count} ${noun}`}>
          <Trash2 size={15} /> <span className="hidden sm:inline">Delete</span>
        </Button>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection (Esc)" title="Clear selection (Esc)">
          <X size={15} />
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${count} ${noun}?`}
        description={
          subtasks
            ? `Their ${subtasks} ${subtasks === 1 ? "subtask is" : "subtasks are"} deleted too. This can't be undone.`
            : "This can't be undone."
        }
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(tasks, {
            onSuccess: () => {
              setConfirming(false);
              onClear();
            },
          })
        }
      />
    </>
  );
}
