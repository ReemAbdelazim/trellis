"use client";

import { useMemo, useState } from "react";
import { Link2, Plus, X } from "lucide-react";
import { useProjectTasks } from "@/lib/queries/tasks";
import { useDependencies, useSetDependency } from "@/lib/queries/task-detail";
import { useTaskPane } from "@/lib/task-pane";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Task } from "@/types/models";

/** "Blocked by" list with a picker over the same project's tasks. */
export function TaskDependencies({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const { data } = useDependencies(task.id);
  const set = useSetDependency();
  const { openTask } = useTaskPane();
  const blockedBy = data?.blockedBy ?? [];
  const blocking = data?.blocking ?? [];

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {blockedBy.map((t) => (
        <DepChip key={t.id} t={t} onOpen={() => openTask(t.id)} onRemove={canEdit ? () => set.mutate({ taskId: task.id, dependsOnId: t.id, add: false }) : undefined} />
      ))}
      {canEdit && task.project_id && (
        <DepPicker
          projectId={task.project_id}
          exclude={[task.id, ...blockedBy.map((t) => t.id)]}
          onPick={(id) => set.mutate({ taskId: task.id, dependsOnId: id, add: true })}
        />
      )}
      {!blockedBy.length && !canEdit && <span className="text-[13px] text-faint">None</span>}
      {blocking.length > 0 && (
        <span className="w-full text-xs text-muted">
          Blocking:{" "}
          {blocking.map((t, i) => (
            <button key={t.id} onClick={() => openTask(t.id)} className="hover:underline">
              {t.name || "Untitled"}
              {i < blocking.length - 1 ? ", " : ""}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

function DepChip({ t, onOpen, onRemove }: { t: Task; onOpen: () => void; onRemove?: () => void }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-56 items-center gap-1 rounded-full border border-border px-2 text-xs",
        t.completed ? "text-faint line-through" : "text-warning",
      )}
    >
      <Link2 size={11} />
      <button onClick={onOpen} className="truncate hover:underline">
        {t.name || "Untitled"}
      </button>
      {onRemove && (
        <button onClick={onRemove} aria-label="Remove dependency" className="text-faint hover:text-danger">
          <X size={11} />
        </button>
      )}
    </span>
  );
}

function DepPicker({ projectId, exclude, onPick }: { projectId: string; exclude: string[]; onPick: (id: string) => void }) {
  const { data: tasks = [] } = useProjectTasks(projectId);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const list = useMemo(
    () =>
      tasks
        .filter((t) => !exclude.includes(t.id) && !t.completed)
        .filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 30),
    [tasks, exclude, q],
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs text-muted hover:bg-surface-2 hover:text-text">
          <Plus size={12} /> Add blocker
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <div className="border-b border-border p-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a task in this project…"
            className="h-8 w-full rounded-md bg-surface-2 px-2 text-sm outline-none"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {list.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onPick(t.id);
                setOpen(false);
              }}
              className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
            >
              {t.name || "Untitled"}
            </button>
          ))}
          {!list.length && <div className="px-2 py-4 text-center text-sm text-faint">No tasks</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
