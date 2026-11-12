"use client";

import { useMemo, useState } from "react";
import { DndContext, DragOverlay, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical, ListPlus, MessageSquare, Plus, Trash2 } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { newId, useCreateTask, useDeleteTasks, useSubtasks, useUpdateTask, type TaskItem } from "@/lib/queries/tasks";
import { sectionsFilter, sectionsKey, useSections } from "@/lib/queries/sections";
import { useRealtime } from "@/lib/queries/realtime";
import { qk } from "@/lib/queries/keys";
import { useTaskPane } from "@/lib/task-pane";
import { Button } from "@/components/ui/button";
import { InlineEdit } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { AddTaskInput } from "@/components/project/task-list/task-inputs";
import { DeleteSectionDialog, SectionMenu, SectionName, useSectionActions, type SectionActions } from "@/components/sections/section-controls";
import { guardDragListeners, NO_SECTION, sectionDndId, taskDndId, useSectionDnd } from "@/components/sections/use-section-dnd";
import { cn, nextPosition } from "@/lib/utils";
import type { Section } from "@/types/models";
import { AssigneeButton, DueDateButton, TaskCheckbox } from "./task-bits";

/** A task's subtasks, optionally grouped into sections; drag to reorder or move between sections. */
export function TaskSubtasks({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const me = useMe();
  const owner = useMemo(() => ({ taskId }), [taskId]);
  const { data: subtasks = [] } = useSubtasks(taskId);
  const { data: sections = [] } = useSections(owner);
  const create = useCreateTask();
  const actions = useSectionActions(owner, sections);
  // Which group shows the "new subtask" input; bumping `n` refocuses it.
  const [composer, setComposer] = useState<{ group: string; n: number } | null>(null);

  useRealtime({ table: "tasks", filter: `parent_id=eq.${taskId}`, invalidate: [qk.subtasks(taskId)] });
  useRealtime({ table: "sections", filter: sectionsFilter(owner), invalidate: [sectionsKey(owner)] });

  // Subtasks arrive in position order, so each group keeps it.
  const { byGroup, groups, byId } = useMemo(() => {
    const byGroup = new Map<string, TaskItem[]>([[NO_SECTION, []], ...sections.map((s): [string, TaskItem[]] => [s.id, []])]);
    for (const t of subtasks) (byGroup.get(t.section_id ?? NO_SECTION) ?? byGroup.get(NO_SECTION)!).push(t);
    return {
      byGroup,
      groups: Object.fromEntries([...byGroup].map(([group, list]) => [group, list.map((t) => t.id)])),
      byId: new Map(subtasks.map((t) => [t.id, t])),
    };
  }, [subtasks, sections]);

  const dnd = useSectionDnd({ owner, sections, groups, tasksById: byId, allBySection: byGroup, manual: true });
  const sectionsById = new Map(sections.map((s) => [s.id, s]));
  const ordered = dnd.order.map((id) => sectionsById.get(id)).filter((s): s is Section => !!s);
  const done = subtasks.filter((s) => s.completed).length;

  const openComposer = (group: string) => setComposer((c) => ({ group, n: (c?.n ?? 0) + 1 }));
  const addSubtask = (group: string, name: string) =>
    create.mutate({
      id: newId(),
      parent_id: taskId,
      section_id: group === NO_SECTION ? null : group,
      name,
      created_by: me.id,
      position: nextPosition(byGroup.get(group) ?? []),
    });

  const groupRows = (group: string) => {
    const rows = (dnd.items[group] ?? []).map((id) => byId.get(id)).filter((t): t is TaskItem => !!t);
    return (
      <>
        {rows.length > 0 && (
          <SortableContext items={rows.map((t) => taskDndId(t.id))} strategy={verticalListSortingStrategy}>
            <ul className="divide-y divide-border rounded-md border border-border">
              {rows.map((t) => (
                <SubtaskRow key={t.id} task={t} canEdit={canEdit} />
              ))}
            </ul>
          </SortableContext>
        )}
        {composer?.group === group && (
          <div
            className="mt-1 flex h-9 items-center gap-1.5 rounded-md border border-accent px-2"
            onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setComposer(null)}
          >
            <Plus size={14} className="shrink-0 text-faint" />
            <AddTaskInput
              placeholder="Subtask name, then Enter"
              focusSignal={composer.n}
              onCreate={(name) => addSubtask(group, name)}
              className="border-0 hover:border-0"
            />
          </div>
        )}
      </>
    );
  };

  return (
    <div>
      <h3 className="mb-1.5 text-[13px] font-semibold">
        Subtasks
        {subtasks.length > 0 && (
          <span className="ml-1.5 font-normal text-faint">
            {done}/{subtasks.length}
          </span>
        )}
      </h3>
      <DndContext {...dnd.context}>
        <UnsectionedGroup showDropZone={!!dnd.activeTask && ordered.length > 0 && !groups[NO_SECTION].length}>
          {groupRows(NO_SECTION)}
        </UnsectionedGroup>
        <SortableContext items={ordered.map((s) => sectionDndId(s.id))} strategy={verticalListSortingStrategy}>
          {ordered.map((section) => (
            <SubtaskSection
              key={section.id}
              section={section}
              count={dnd.items[section.id]?.length ?? 0}
              collapsed={!!dnd.activeSection}
              canEdit={canEdit}
              actions={actions}
              sectionCount={ordered.length}
              onAddSubtask={() => openComposer(section.id)}
            >
              {groupRows(section.id)}
            </SubtaskSection>
          ))}
        </SortableContext>
        <DragOverlay>
          {dnd.activeTask ? (
            <div className="flex h-9 w-[min(360px,80vw)] items-center gap-2 rounded-md border border-border bg-surface px-2 text-[13px] shadow-pop">
              <GripVertical size={13} className="text-faint" />
              <span className="truncate">{dnd.activeTask.name || "Untitled task"}</span>
            </div>
          ) : dnd.activeSection ? (
            <div className="flex h-8 w-[min(360px,80vw)] items-center gap-2 rounded-md border border-border bg-surface px-2 text-[13px] font-semibold shadow-pop">
              <GripVertical size={13} className="text-faint" />
              <span className="truncate">{dnd.activeSection.name || "Untitled section"}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {canEdit && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" onClick={() => openComposer(ordered.at(-1)?.id ?? NO_SECTION)}>
            <Plus size={14} /> Add subtask
          </Button>
          <Button variant="ghost" size="sm" onClick={() => actions.add()} disabled={actions.adding}>
            <ListPlus size={14} /> Add section
          </Button>
        </div>
      )}
      <DeleteSectionDialog actions={actions} sections={ordered} taskCount={(id) => byGroup.get(id)?.length ?? 0} />
    </div>
  );
}

/** Subtasks outside any section; while dragging it becomes a drop target to take a subtask out of its section. */
function UnsectionedGroup({ showDropZone, children }: { showDropZone: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: sectionDndId(NO_SECTION) });
  return (
    <div ref={setNodeRef}>
      {showDropZone && (
        <div
          className={cn(
            "flex h-9 items-center justify-center rounded-md border border-dashed text-[12px] text-faint",
            isOver ? "border-accent bg-accent-soft text-accent-ink" : "border-border",
          )}
        >
          Drop here to remove from its section
        </div>
      )}
      {children}
    </div>
  );
}

function SubtaskSection({
  section,
  count,
  collapsed,
  canEdit,
  actions,
  sectionCount,
  onAddSubtask,
  children,
}: {
  section: Section;
  count: number;
  /** Rows are hidden while sections are being reordered. */
  collapsed: boolean;
  canEdit: boolean;
  actions: SectionActions;
  sectionCount: number;
  onAddSubtask: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: sectionDndId(section.id),
    disabled: !canEdit,
  });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("mt-3", isDragging && "opacity-40")}
      aria-label={section.name || "Untitled section"}
    >
      <div className="group/section flex h-8 items-center gap-0.5">
        {canEdit && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...guardDragListeners(listeners)}
            aria-label="Drag to move section"
            className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint opacity-60 active:cursor-grabbing sm:opacity-0 sm:group-hover/section:opacity-100 sm:focus-visible:opacity-100"
          >
            <GripVertical size={13} />
          </button>
        )}
        <div className="min-w-0 text-[13px]">
          <SectionName section={section} actions={actions} canEdit={canEdit} />
        </div>
        <span className="ml-1 shrink-0 text-[12px] text-faint tabular-nums">{count}</span>
        {canEdit && (
          <div className="ml-auto flex items-center sm:opacity-0 sm:group-hover/section:opacity-100 sm:focus-within:opacity-100">
            <Tooltip content="Add subtask">
              <Button variant="ghost" size="icon-sm" onClick={onAddSubtask} aria-label={`Add subtask to ${section.name}`}>
                <Plus size={14} />
              </Button>
            </Tooltip>
            <SectionMenu section={section} actions={actions} sectionCount={sectionCount} />
          </div>
        )}
      </div>
      {!collapsed && children}
    </section>
  );
}

function SubtaskRow({ task, canEdit }: { task: TaskItem; canEdit: boolean }) {
  const update = useUpdateTask();
  const del = useDeleteTasks();
  const { openTask } = useTaskPane();
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: taskDndId(task.id),
    disabled: !canEdit,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group flex h-9 items-center gap-2 bg-surface px-2", isDragging && "opacity-40")}
    >
      {canEdit && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...guardDragListeners(listeners)}
          aria-label="Drag to move subtask"
          className="-ml-1 flex h-6 w-3.5 shrink-0 cursor-grab touch-none items-center justify-center text-faint opacity-60 active:cursor-grabbing sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          <GripVertical size={12} />
        </button>
      )}
      <TaskCheckbox task={task} disabled={!canEdit} size={15} />
      <div className={cn("min-w-0 flex-1 text-[13px]", task.completed && "text-faint line-through")}>
        <InlineEdit value={task.name} disabled={!canEdit} onSave={(name) => update.mutate({ id: task.id, name })} />
      </div>
      {task.comment_count > 0 && (
        <span className="flex items-center gap-0.5 text-[11px] text-faint">
          <MessageSquare size={12} /> {task.comment_count}
        </span>
      )}
      <DueDateButton task={task} disabled={!canEdit} />
      <AssigneeButton task={task} disabled={!canEdit} size="xs" />
      {canEdit && (
        <button
          onClick={() => del.mutate([task])}
          className="rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-danger"
          aria-label="Delete subtask"
        >
          <Trash2 size={13} />
        </button>
      )}
      <button
        onClick={() => openTask(task.id)}
        className="rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-text"
        aria-label="Open subtask"
      >
        <ChevronRight size={14} />
      </button>
    </li>
  );
}
