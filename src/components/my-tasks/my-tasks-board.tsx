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
import { MessageSquare } from "lucide-react";
import { useUpdateTask, type TaskItem } from "@/lib/queries/tasks";
import { useTaskPane } from "@/lib/task-pane";
import { TaskCheckbox, DueDateButton } from "@/components/task/task-bits";
import { cn } from "@/lib/utils";
import { BUCKET_DROP_PREFIX, BUCKETS, computeMove, type Bucket, type SortMode } from "./buckets";
import { bucketCollision, useDragSensors } from "./dnd";
import { ParentHint, ProjectChip } from "./task-meta";
import type { TaskListContext } from "./my-tasks-list";

export function MyTasksBoard({
  groups,
  sort,
  ctx,
}: {
  groups: Map<Bucket, TaskItem[]>;
  sort: SortMode;
  ctx: TaskListContext;
}) {
  const dndId = useId();
  const sensors = useDragSensors();
  const update = useUpdateTask();
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? [...groups.values()].flat().find((t) => t.id === activeId) : undefined;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    computeMove(groups, String(e.active.id), String(e.over.id), sort === "manual").forEach((m) => update.mutate(m));
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={bucketCollision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex h-full min-h-0 gap-3 overflow-x-auto px-4 pb-4 scrollbar-thin sm:px-6">
        {BUCKETS.map((b) => {
          const list = groups.get(b.id) ?? [];
          return (
            <Column key={b.id} bucket={b.id} label={b.label} count={list.length}>
              <SortableContext items={list.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                {list.map((t) => (
                  <SortableCard key={t.id} task={t} ctx={ctx} />
                ))}
              </SortableContext>
              {!list.length && (
                <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-faint">
                  {activeId ? "Drop here" : "No tasks"}
                </div>
              )}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={null}>{active ? <Card task={active} ctx={ctx} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({
  bucket,
  label,
  count,
  children,
}: {
  bucket: Bucket;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${BUCKET_DROP_PREFIX}${bucket}` });
  return (
    <div className="flex w-[272px] shrink-0 flex-col">
      <div className="flex h-9 items-center gap-2 px-1 text-[13.5px] font-semibold">
        {label}
        <span className="text-xs font-normal text-faint">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-surface-2/60 p-2 scrollbar-thin",
          isOver && "bg-accent-soft/50",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function SortableCard({ task, ctx }: { task: TaskItem; ctx: TaskListContext }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...listeners}
      className={cn(isDragging && "opacity-40")}
    >
      <Card task={task} ctx={ctx} />
    </div>
  );
}

function Card({ task, ctx, overlay }: { task: TaskItem; ctx: TaskListContext; overlay?: boolean }) {
  const { openTask, taskId } = useTaskPane();
  const project = task.project_id ? ctx.projects.get(task.project_id) : undefined;
  const parentName = task.parent_id ? ctx.parentNames.get(task.parent_id) : undefined;
  return (
    <div
      onClick={() => openTask(task.id)}
      className={cn(
        "group cursor-pointer rounded-lg border border-border bg-surface p-3 text-[13.5px] shadow-sm hover:border-border-strong",
        taskId === task.id && "border-accent",
        overlay && "rotate-1 shadow-pop",
      )}
    >
      <div className="flex items-start gap-2">
        <TaskCheckbox task={task} className="mt-0.5" disabled={overlay} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openTask(task.id);
          }}
          className={cn("min-w-0 flex-1 text-left break-words", task.completed && "text-faint line-through")}
        >
          {task.name || <span className="text-faint">Untitled task</span>}
        </button>
      </div>
      {parentName && <ParentHint name={parentName} className="mt-1 max-w-full pl-6" />}
      <div className="mt-2 flex min-w-0 items-center gap-2 pl-5">
        <ProjectChip project={project} />
        {task.comment_count > 0 && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11.5px] text-faint">
            <MessageSquare size={11} /> {task.comment_count}
          </span>
        )}
        <span className="ml-auto">
          <DueDateButton task={task} />
        </span>
      </div>
    </div>
  );
}
