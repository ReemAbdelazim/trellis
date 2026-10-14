"use client";

import { useRef, useState } from "react";
import { ChevronRight, MessageSquare, Plus, Trash2 } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { newId, useCreateTask, useDeleteTask, useSubtasks, useUpdateTask } from "@/lib/queries/tasks";
import { useRealtime } from "@/lib/queries/realtime";
import { qk } from "@/lib/queries/keys";
import { useTaskPane } from "@/lib/task-pane";
import { InlineEdit } from "@/components/ui/misc";
import { nextPosition, cn } from "@/lib/utils";
import { AssigneeButton, DueDateButton, TaskCheckbox } from "./task-bits";

export function TaskSubtasks({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const me = useMe();
  const { data: subtasks = [] } = useSubtasks(taskId);
  const create = useCreateTask();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const { openTask } = useTaskPane();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  // Escape removes the input, which fires blur; don't create the subtask then.
  const cancelled = useRef(false);

  useRealtime({ table: "tasks", filter: `parent_id=eq.${taskId}`, invalidate: [qk.subtasks(taskId)] });

  const add = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const name = draft.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    create.mutate({ id: newId(), parent_id: taskId, name, created_by: me.id, position: nextPosition(subtasks) });
    setDraft("");
  };

  const done = subtasks.filter((s) => s.completed).length;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">
          Subtasks
          {subtasks.length > 0 && (
            <span className="ml-1.5 font-normal text-faint">
              {done}/{subtasks.length}
            </span>
          )}
        </h3>
      </div>
      {subtasks.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {subtasks.map((s) => (
            <li key={s.id} className="group flex h-9 items-center gap-2 px-2">
              <TaskCheckbox task={s} disabled={!canEdit} size={15} />
              <div className={cn("min-w-0 flex-1 text-[13px]", s.completed && "text-faint line-through")}>
                <InlineEdit value={s.name} disabled={!canEdit} onSave={(name) => update.mutate({ id: s.id, name })} />
              </div>
              {s.comment_count > 0 && (
                <span className="flex items-center gap-0.5 text-[11px] text-faint">
                  <MessageSquare size={12} /> {s.comment_count}
                </span>
              )}
              <DueDateButton task={s} disabled={!canEdit} />
              <AssigneeButton task={s} disabled={!canEdit} size="xs" />
              {canEdit && (
                <button
                  onClick={() => del.mutate(s)}
                  className="rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-danger"
                  aria-label="Delete subtask"
                >
                  <Trash2 size={13} />
                </button>
              )}
              <button
                onClick={() => openTask(s.id)}
                className="rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-text"
                aria-label="Open subtask"
              >
                <ChevronRight size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {canEdit &&
        (adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") {
                cancelled.current = true;
                setDraft("");
                setAdding(false);
              }
            }}
            placeholder="Subtask name, then Enter"
            className="mt-1.5 h-9 w-full rounded-md border border-accent bg-surface px-2 text-[13px] outline-none"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-1.5 flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted hover:bg-surface-2 hover:text-text"
          >
            <Plus size={14} /> Add subtask
          </button>
        ))}
    </div>
  );
}
