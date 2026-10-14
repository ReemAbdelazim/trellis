"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical, ListTree, MessageSquare } from "lucide-react";
import { AssigneeButton, DueDateButton, TaskCheckbox } from "@/components/task/task-bits";
import { FieldValueEditor } from "@/components/fields/field-value-editor";
import { cn } from "@/lib/utils";
import type { TaskItem } from "@/lib/queries/tasks";
import type { Json } from "@/types/database";
import type { CustomField } from "@/types/models";
import { TaskNameInput } from "./task-inputs";
import { guardDragListeners, taskDndId } from "./use-section-dnd";

/** Grid template shared by the header, rows and add rows (set as --cols on the table). */
export function listColumns(fieldCount: number) {
  return {
    template: ["minmax(var(--name-col), 1fr)", "136px", "120px", ...Array(fieldCount).fill("160px"), "44px"].join(" "),
    /** Width of everything except the name column, for the table's min-width. */
    rest: 136 + 120 + fieldCount * 160 + 44,
  };
}

export const ROW_GRID = "grid [grid-template-columns:var(--cols)]";
export const CELL = "flex min-w-0 items-center border-b border-l border-border px-2";
/** Sticky first column; needs an opaque background so cells scroll under it. */
export const NAME_CELL = "sticky left-0 z-[5] flex min-w-0 items-center gap-1.5 border-b border-border pr-2 pl-1 sm:pl-3";

export function TaskCounts({ task, className }: { task: Pick<TaskItem, "subtask_count" | "comment_count">; className?: string }) {
  if (!task.subtask_count && !task.comment_count) return null;
  return (
    <span className={cn("flex shrink-0 items-center gap-2 text-[12px] text-faint", className)}>
      {task.subtask_count > 0 && (
        <span className="flex items-center gap-0.5" title={`${task.subtask_count} subtasks`}>
          {task.subtask_count}
          <ListTree size={12} />
        </span>
      )}
      {task.comment_count > 0 && (
        <span className="flex items-center gap-0.5" title={`${task.comment_count} comments`}>
          {task.comment_count}
          <MessageSquare size={12} />
        </span>
      )}
    </span>
  );
}

export function ListRow({
  task,
  fields,
  values,
  selected,
  editable,
  draggable,
  onOpen,
  onFieldChange,
}: {
  task: TaskItem;
  fields: CustomField[];
  values: Map<string, Json | null> | undefined;
  selected: boolean;
  /** Can change this task (project editor, creator or assignee). */
  editable: boolean;
  draggable: boolean;
  onOpen: (id: string) => void;
  onFieldChange: (taskId: string, fieldId: string, value: Json | null) => void;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: taskDndId(task.id),
    disabled: !draggable,
  });
  const bg = selected ? "bg-accent-soft" : "bg-surface group-hover:bg-surface-2";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      tabIndex={0}
      aria-label={task.name || "Untitled task"}
      aria-current={selected || undefined}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen(task.id);
        }
      }}
      className={cn(
        ROW_GRID,
        "group min-h-9 cursor-pointer outline-none focus-visible:relative focus-visible:z-[6] focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
        isDragging && "opacity-40",
      )}
    >
      <div className={cn(NAME_CELL, bg)}>
        {draggable ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...guardDragListeners(listeners)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Drag to move task"
            className="flex h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint opacity-60 active:cursor-grabbing sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          >
            <GripVertical size={13} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <TaskCheckbox task={task} disabled={!editable} />
        {editable ? (
          <TaskNameInput task={task} />
        ) : (
          <span className={cn("min-w-0 flex-1 truncate px-1 text-[13.5px]", task.completed && "text-faint line-through")}>
            {task.name || "Untitled task"}
          </span>
        )}
        <TaskCounts task={task} />
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(task.id);
          }}
          aria-label="Open task details"
          className="flex h-6 shrink-0 items-center gap-0.5 rounded px-1 text-[12px] text-muted opacity-0 group-hover:opacity-100 hover:bg-surface-3 hover:text-text"
        >
          <span className="hidden lg:inline">Details</span>
          <ChevronRight size={14} />
        </button>
      </div>
      <div className={cn(CELL, bg)}>
        <AssigneeButton task={task} disabled={!editable} showName size="xs" />
      </div>
      <div className={cn(CELL, bg)}>
        <DueDateButton task={task} disabled={!editable} />
      </div>
      {fields.map((f) => (
        <div key={f.id} className={cn(CELL, "px-0", bg)} onClick={(e) => e.stopPropagation()}>
          <FieldValueEditor
            compact
            field={f}
            value={values?.get(f.id)}
            disabled={!editable}
            onChange={(value) => onFieldChange(task.id, f.id, value)}
          />
        </div>
      ))}
      <div className={cn(CELL, bg)} />
    </div>
  );
}

/** What follows the pointer while a row is dragged. */
export function ListRowOverlay({ task }: { task: TaskItem }) {
  return (
    <div className="flex h-9 w-[min(420px,85vw)] items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13.5px] shadow-pop">
      <GripVertical size={13} className="shrink-0 text-faint" />
      <span
        className={cn(
          "h-4 w-4 shrink-0 rounded-full border",
          task.completed ? "border-success bg-success" : "border-border-strong",
        )}
      />
      <span className={cn("min-w-0 flex-1 truncate", task.completed && "text-faint line-through")}>
        {task.name || "Untitled task"}
      </span>
      <TaskCounts task={task} />
    </div>
  );
}
