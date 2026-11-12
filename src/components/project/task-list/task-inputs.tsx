"use client";

import { useEffect, useRef, useState } from "react";
import { useMe } from "@/lib/queries/me";
import { newId, useCreateTask, useUpdateTask, type TaskItem } from "@/lib/queries/tasks";
import { cn, nextPosition } from "@/lib/utils";

/** Create a task at the end of a section (positions ignore filters). */
export function useAddTask(projectId: string, allBySection: Map<string, TaskItem[]>) {
  const me = useMe();
  const create = useCreateTask();
  return (sectionId: string, name: string) => {
    const id = newId();
    create.mutate({
      id,
      project_id: projectId,
      section_id: sectionId,
      name,
      position: nextPosition(allBySection.get(sectionId) ?? []),
      created_by: me.id,
    });
    return id;
  };
}

/** Always-on name input for a task row: saves on blur / Enter, Escape reverts. */
export function TaskNameInput({ task, className }: { task: Pick<TaskItem, "id" | "name" | "completed">; className?: string }) {
  const update = useUpdateTask();
  const [draft, setDraft] = useState(task.name);
  const [focused, setFocused] = useState(false);

  // Follow remote renames while the user isn't typing.
  const [synced, setSynced] = useState(task.name);
  if (synced !== task.name && !focused) {
    setSynced(task.name);
    setDraft(task.name);
  }

  const commit = () => {
    const next = draft.trim();
    if (next && next !== task.name) update.mutate({ id: task.id, name: next });
    else setDraft(task.name);
  };

  return (
    <input
      value={draft}
      aria-label="Task name"
      placeholder="Write a task name"
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(task.name);
          // Blur after the reset has rendered so the old name isn't saved back.
          const el = e.currentTarget;
          requestAnimationFrame(() => el.blur());
        }
      }}
      className={cn(
        "h-7 min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1 text-[13.5px] outline-none",
        "hover:border-border focus:border-accent focus:bg-surface",
        task.completed && "text-faint line-through focus:no-underline",
        className,
      )}
    />
  );
}

/**
 * "Add task…" input. Enter creates and keeps focus for the next one, Escape
 * clears and leaves. Bump `focusSignal` to focus it from elsewhere.
 */
export function AddTaskInput({
  onCreate,
  focusSignal = 0,
  placeholder = "Add task…",
  className,
}: {
  onCreate: (name: string) => void;
  focusSignal?: number;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (focusSignal > 0) {
      ref.current?.focus();
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [focusSignal]);

  const submit = () => {
    const name = value.trim();
    if (!name) return;
    onCreate(name);
    setValue("");
  };

  return (
    <input
      ref={ref}
      value={value}
      placeholder={placeholder}
      aria-label="New task name"
      onChange={(e) => setValue(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") {
          setValue("");
          const el = e.currentTarget;
          requestAnimationFrame(() => el.blur());
        }
      }}
      className={cn(
        "h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-[13.5px] outline-none placeholder:text-faint",
        "hover:border-border focus:border-accent focus:bg-surface",
        className,
      )}
    />
  );
}
