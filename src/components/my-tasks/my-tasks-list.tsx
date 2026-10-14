"use client";

import { useId, useState } from "react";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical, MessageSquare, Plus } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { newId, useCreateTask, useUpdateTask, type TaskItem } from "@/lib/queries/tasks";
import { useTaskPane } from "@/lib/task-pane";
import { TaskCheckbox, DueDateButton } from "@/components/task/task-bits";
import { cn } from "@/lib/utils";
import { BUCKET_DROP_PREFIX, BUCKETS, computeMove, type Bucket, type SortMode } from "./buckets";
import { bucketCollision, useDragSensors } from "./dnd";
import { ParentHint, ProjectChip } from "./task-meta";
import type { Project } from "@/types/models";

const GRID = "grid grid-cols-[minmax(0,1fr)_92px] sm:grid-cols-[minmax(0,1fr)_120px_200px]";

export interface TaskListContext {
  projects: Map<string, Project>;
  parentNames: Map<string, string>;
}

export function MyTasksList({
  groups,
  sort,
  ctx,
  showAdd,
}: {
  groups: Map<Bucket, TaskItem[]>;
  sort: SortMode;
  ctx: TaskListContext;
  showAdd: boolean;
}) {
  const dndId = useId();
  const sensors = useDragSensors();
  const update = useUpdateTask();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<Bucket>>(new Set());

  const active = activeId ? [...groups.values()].flat().find((t) => t.id === activeId) : undefined;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const moves = computeMove(groups, String(e.active.id), String(e.over.id), sort === "manual");
    moves.forEach((m) => update.mutate(m));
  };

  const toggle = (b: Bucket) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });

  return (
    <div className="min-w-0">
      <div className={cn(GRID, "sticky top-0 z-10 border-y border-border bg-surface text-xs font-medium text-faint")}>
        <div className="py-2 pl-9">Task name</div>
        <div className="border-l border-border px-2 py-2">Due date</div>
        <div className="hidden border-l border-border px-2 py-2 sm:block">Project</div>
      </div>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={bucketCollision}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {BUCKETS.map((b) => {
          const list = groups.get(b.id) ?? [];
          const isCollapsed = collapsed.has(b.id);
          return (
            <section key={b.id} className="pb-2">
              <button
                type="button"
                onClick={() => toggle(b.id)}
                className="flex h-10 w-full items-center gap-1.5 px-2 text-left text-[14px] font-semibold hover:bg-surface-2/60"
                aria-expanded={!isCollapsed}
              >
                <ChevronDown size={15} className={cn("text-muted transition-transform", isCollapsed && "-rotate-90")} />
                {b.label}
                <span className="text-xs font-normal text-faint">{list.length}</span>
              </button>
              {!isCollapsed && (
                <BucketDrop bucket={b.id}>
                  {showAdd && b.id === "recently_assigned" && <InlineAdd />}
                  <SortableContext items={list.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    {list.map((t) => (
                      <SortableRow key={t.id} task={t} ctx={ctx} />
                    ))}
                  </SortableContext>
                  {!list.length && (
                    <div className="border-b border-border py-2.5 pl-9 text-[13px] text-faint">
                      {activeId ? "Drop here" : "Nothing here"}
                    </div>
                  )}
                </BucketDrop>
              )}
            </section>
          );
        })}
        <DragOverlay dropAnimation={null}>
          {active ? (
            <div className="flex h-10 max-w-md items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm shadow-pop">
              <TaskCheckbox task={active} disabled />
              <span className="truncate">{active.name || "Untitled task"}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function BucketDrop({ bucket, children }: { bucket: Bucket; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${BUCKET_DROP_PREFIX}${bucket}` });
  return (
    <div ref={setNodeRef} className={cn("rounded-sm", isOver && "bg-accent-soft/40")}>
      {children}
    </div>
  );
}

function SortableRow({ task, ctx }: { task: TaskItem; ctx: TaskListContext }) {
  const { openTask, taskId } = useTaskPane();
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id: task.id });
  const project = task.project_id ? ctx.projects.get(task.project_id) : undefined;
  const parentName = task.parent_id ? ctx.parentNames.get(task.parent_id) : undefined;
  const open = taskId === task.id;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...listeners}
      onClick={() => openTask(task.id)}
      className={cn(
        GRID,
        "group h-10 cursor-pointer border-b border-border bg-surface text-[13.5px] hover:bg-surface-2/70",
        open && "bg-accent-soft/60 hover:bg-accent-soft/60",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 pr-2">
        <span className="flex w-5 shrink-0 justify-center text-faint opacity-0 group-hover:opacity-100" aria-hidden>
          <GripVertical size={13} />
        </span>
        <TaskCheckbox task={task} />
        <button
          type="button"
          className={cn("min-w-0 truncate text-left", task.completed && "text-faint line-through decoration-faint/60")}
          onClick={(e) => {
            e.stopPropagation();
            openTask(task.id);
          }}
        >
          {task.name || <span className="text-faint">Untitled task</span>}
        </button>
        <ParentHint name={parentName} className="hidden max-w-40 md:inline-flex" />
        {task.subtask_count > 0 && (
          <span className="hidden shrink-0 text-[11.5px] text-faint sm:inline" title={`${task.subtask_count} subtasks`}>
            {task.subtask_count} ↳
          </span>
        )}
        {task.comment_count > 0 && (
          <span className="hidden shrink-0 items-center gap-0.5 text-[11.5px] text-faint sm:inline-flex">
            <MessageSquare size={11} /> {task.comment_count}
          </span>
        )}
        <ProjectChip project={project} className="ml-auto max-w-24 sm:hidden" />
      </div>
      <div className="flex items-center border-l border-border px-1">
        <DueDateButton task={task} />
      </div>
      <div className="hidden min-w-0 items-center border-l border-border px-2 sm:flex">
        <ProjectChip project={project} />
      </div>
    </div>
  );
}

function InlineAdd() {
  const me = useMe();
  const create = useCreateTask();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  const submit = () => {
    const value = name.trim();
    if (!value) {
      setEditing(false);
      return;
    }
    create.mutate({
      id: newId(),
      name: value,
      project_id: null,
      assignee_id: me.id,
      created_by: me.id,
      my_tasks_bucket: "recently_assigned",
      my_tasks_position: 0,
    });
    setName("");
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex h-9 w-full items-center gap-2 border-b border-border pl-9 text-left text-[13px] text-faint hover:bg-surface-2/60 hover:text-text"
      >
        <Plus size={14} /> Add task…
      </button>
    );
  }
  return (
    <div className="flex h-10 items-center gap-2 border-b border-border bg-surface pl-9 pr-2">
      <span className="h-4 w-4 shrink-0 rounded-full border border-border-strong" />
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") {
            setName("");
            setEditing(false);
          }
        }}
        placeholder="Write a task name, press Enter"
        className="h-8 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint"
      />
    </div>
  );
}
