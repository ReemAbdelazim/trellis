"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AssigneeButton, DueDateButton, TaskCheckbox } from "@/components/task/task-bits";
import { asString, fieldOptions, OptionPill } from "@/components/fields/field-meta";
import { cn } from "@/lib/utils";
import type { TaskItem } from "@/lib/queries/tasks";
import type { Json } from "@/types/database";
import type { CustomField, FieldOption } from "@/types/models";
import { TaskCounts } from "../task-list/list-row";
import { guardDragListeners, taskDndId } from "../task-list/use-section-dnd";

/** Selected options of the project's single-select fields, for the pills on a card. */
function selectPills(fields: CustomField[], values: Map<string, Json | null> | undefined) {
  const pills: (FieldOption & { fieldId: string })[] = [];
  if (!values) return pills;
  for (const f of fields) {
    if (f.type !== "single_select") continue;
    const id = asString(values.get(f.id));
    const option = id ? fieldOptions(f).find((o) => o.id === id) : undefined;
    if (option) pills.push({ ...option, fieldId: f.id });
  }
  return pills;
}

function CardBody({
  task,
  fields,
  values,
  editable,
}: {
  task: TaskItem;
  fields: CustomField[];
  values: Map<string, Json | null> | undefined;
  editable: boolean;
}) {
  const pills = selectPills(fields, values);
  return (
    <>
      <div className="flex items-start gap-2">
        <TaskCheckbox task={task} disabled={!editable} className="mt-0.5" />
        <p
          className={cn(
            "line-clamp-4 min-w-0 flex-1 text-[13.5px] leading-snug break-words",
            task.completed && "text-faint line-through",
            !task.name && "text-faint",
          )}
        >
          {task.name || "Untitled task"}
        </p>
      </div>
      {pills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 pl-6">
          {pills.map((p) => (
            <OptionPill key={p.fieldId} option={p} />
          ))}
        </div>
      )}
      <div className="mt-2 flex min-h-6 items-center gap-1 pl-6">
        <AssigneeButton task={task} disabled={!editable} size="xs" />
        <DueDateButton task={task} disabled={!editable} />
        <TaskCounts task={task} className="ml-auto" />
      </div>
    </>
  );
}

const CARD =
  "group rounded-lg border border-border bg-surface p-2.5 text-left shadow-card transition-[border-color,box-shadow]";

export function BoardCard({
  task,
  fields,
  values,
  selected,
  editable,
  draggable,
  onOpen,
}: {
  task: TaskItem;
  fields: CustomField[];
  values: Map<string, Json | null> | undefined;
  selected: boolean;
  editable: boolean;
  draggable: boolean;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: taskDndId(task.id),
    disabled: !draggable,
  });
  const drag = guardDragListeners(listeners);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...drag}
      tabIndex={0}
      role="button"
      aria-label={task.name || "Untitled task"}
      aria-current={selected || undefined}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen(task.id);
          return;
        }
        drag?.onKeyDown?.(e);
      }}
      className={cn(
        CARD,
        "cursor-pointer hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        selected && "border-accent ring-1 ring-accent",
        task.completed && "bg-surface/70",
        isDragging && "opacity-40",
      )}
    >
      <CardBody task={task} fields={fields} values={values} editable={editable} />
    </div>
  );
}

/** What follows the pointer while a card is dragged. */
export function BoardCardOverlay({
  task,
  fields,
  values,
}: {
  task: TaskItem;
  fields: CustomField[];
  values: Map<string, Json | null> | undefined;
}) {
  return (
    <div className={cn(CARD, "w-[256px] rotate-2 cursor-grabbing shadow-pop")}>
      <CardBody task={task} fields={fields} values={values} editable={false} />
    </div>
  );
}
