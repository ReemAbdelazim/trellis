"use client";

import { useState } from "react";
import Link from "next/link";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical, ListChecks, Plus, Settings2 } from "lucide-react";
import { useCustomFields, useProjectFieldValues, useSetFieldValue } from "@/lib/queries/fields";
import { useTaskPane } from "@/lib/task-pane";
import type { TaskItem } from "@/lib/queries/tasks";
import { Button } from "@/components/ui/button";
import { EmptyState, PageLoader } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { FieldTypeIcon } from "@/components/fields/field-meta";
import { cn } from "@/lib/utils";
import type { Json } from "@/types/database";
import type { CustomField, Section } from "@/types/models";
import { TaskViewToolbar } from "../task-list/toolbar";
import { useProjectTasksView } from "../task-list/use-project-tasks-view";
import { guardDragListeners, sectionDndId, taskDndId, useSectionDnd } from "../task-list/use-section-dnd";
import { DeleteSectionDialog, SectionMenu, SectionName, useSectionActions, type SectionActions } from "../task-list/section-controls";
import { AddTaskInput, useAddTask } from "../task-list/task-inputs";
import { CELL, listColumns, ListRow, ListRowOverlay, NAME_CELL, ROW_GRID } from "../task-list/list-row";
import { routes } from "@/lib/routes";

export function ProjectListView({ projectId }: { projectId: string }) {
  const view = useProjectTasksView(projectId);
  const { sections, tasksById, allBySection, canEdit, me } = view;
  const { taskId: openId, openTask } = useTaskPane();
  const { data: fields = [] } = useCustomFields(projectId);
  const { map: fieldValues } = useProjectFieldValues(projectId);
  const setField = useSetFieldValue(projectId);
  const actions = useSectionActions(projectId, sections);
  const addTask = useAddTask(projectId, allBySection);
  const manual = view.options.sort === "manual";
  const dnd = useSectionDnd({ projectId, sections, groups: view.groups, tasksById, allBySection, manual });

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  // Bumping `n` focuses that section's "Add task…" input.
  const [focusAdd, setFocusAdd] = useState<{ sectionId: string; n: number } | null>(null);
  const [started, setStarted] = useState(false);

  if (view.loading) return <PageLoader />;

  const byId = new Map(sections.map((s) => [s.id, s]));
  const ordered = dnd.order.map((id) => byId.get(id)).filter((s): s is Section => !!s);
  const draggingSection = !!dnd.activeSection;

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const focusComposer = (sectionId: string) => {
    setStarted(true);
    setCollapsed((prev) => {
      if (!prev.has(sectionId)) return prev;
      const next = new Set(prev);
      next.delete(sectionId);
      return next;
    });
    setFocusAdd((f) => ({ sectionId, n: (f?.n ?? 0) + 1 }));
  };

  const onFieldChange = (taskId: string, fieldId: string, value: Json | null) =>
    setField.mutate({ taskId, fieldId, value });

  const toolbar = (
    <TaskViewToolbar
      options={view.options}
      onOptionsChange={view.setOptions}
      search={view.search}
      onSearchChange={view.setSearch}
      assigneeIds={view.assigneeIds}
      onAddTask={canEdit && ordered.length ? () => focusComposer(ordered[0].id) : undefined}
    />
  );

  if (!ordered.length || (view.tasks.length === 0 && !started)) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {toolbar}
        <EmptyState
          icon={<ListChecks size={36} />}
          title={ordered.length ? "No tasks yet" : "No sections yet"}
          description={
            canEdit
              ? "Break the work into tasks, give each one an owner and a due date, and track it here."
              : "Nothing has been added to this project yet."
          }
          action={
            canEdit &&
            (ordered.length ? (
              <Button variant="primary" onClick={() => focusComposer(ordered[0].id)}>
                <Plus size={15} /> Add a task
              </Button>
            ) : (
              <Button variant="primary" onClick={() => actions.add()} disabled={actions.adding}>
                <Plus size={15} /> Add a section
              </Button>
            ))
          }
          className="flex-1"
        />
      </div>
    );
  }

  const { template, rest } = listColumns(fields.length);
  const nothingVisible = view.tasks.length > 0 && view.visibleCount === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbar}
      <div className="min-h-0 flex-1 overflow-auto bg-surface scrollbar-thin">
        <div
          className="w-full pb-24 [--name-col:220px] sm:[--name-col:340px]"
          style={{ minWidth: `calc(var(--name-col) + ${rest}px)`, ["--cols" as string]: template }}
        >
          <HeaderRow projectId={projectId} fields={fields} />
          {nothingVisible && (
            <div className="sticky left-0 w-fit max-w-[100vw] px-4 py-3 text-[13px] text-muted sm:px-6">
              No tasks match {view.search.trim() ? "your search" : "these filters"}.{" "}
              <button
                type="button"
                className="font-medium text-accent hover:underline"
                onClick={() => {
                  view.setSearch("");
                  view.setOptions({ status: "all", assignee: "any", due: "any" });
                }}
              >
                Show all tasks
              </button>
            </div>
          )}
          <DndContext {...dnd.context}>
            <SortableContext items={ordered.map((s) => sectionDndId(s.id))} strategy={verticalListSortingStrategy}>
              {ordered.map((section) => {
                const ids = dnd.items[section.id] ?? [];
                return (
                  <ListSection
                    key={section.id}
                    section={section}
                    tasks={ids.map((id) => tasksById.get(id)).filter((t): t is TaskItem => !!t)}
                    total={ids.length}
                    collapsed={draggingSection || collapsed.has(section.id)}
                    onToggle={() => toggle(section.id)}
                    canEdit={canEdit}
                    actions={actions}
                    sectionCount={ordered.length}
                    onAddTask={() => focusComposer(section.id)}
                    composer={
                      canEdit && (
                        <AddTaskRow
                          focusSignal={focusAdd?.sectionId === section.id ? focusAdd.n : 0}
                          onCreate={(name) => addTask(section.id, name)}
                        />
                      )
                    }
                  >
                    {(task) => (
                      <ListRow
                        key={task.id}
                        task={task}
                        fields={fields}
                        values={fieldValues.get(task.id)}
                        selected={openId === task.id}
                        editable={canEdit || task.assignee_id === me.id || task.created_by === me.id}
                        draggable={canEdit}
                        onOpen={openTask}
                        onFieldChange={onFieldChange}
                      />
                    )}
                  </ListSection>
                );
              })}
            </SortableContext>
            <DragOverlay>
              {dnd.activeTask ? (
                <ListRowOverlay task={dnd.activeTask} />
              ) : dnd.activeSection ? (
                <div className="flex h-10 w-[min(360px,85vw)] items-center gap-2 rounded-md border border-border bg-surface px-3 font-semibold shadow-pop">
                  <GripVertical size={14} className="text-faint" />
                  <span className="truncate">{dnd.activeSection.name || "Untitled section"}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          {canEdit && (
            <div className="sticky left-0 w-fit px-4 pt-4 sm:px-6">
              <Button variant="ghost" size="sm" onClick={() => actions.add()} disabled={actions.adding}>
                <Plus size={15} /> Add section
              </Button>
            </div>
          )}
        </div>
      </div>
      <DeleteSectionDialog
        actions={actions}
        sections={ordered}
        taskCount={(id) => allBySection.get(id)?.length ?? 0}
      />
    </div>
  );
}

function HeaderRow({ projectId, fields }: { projectId: string; fields: CustomField[] }) {
  const head = "text-[12px] font-medium text-muted";
  return (
    <div className={cn(ROW_GRID, "sticky top-0 z-20 h-9")}>
      <div className={cn(NAME_CELL, head, "z-[21] bg-surface")}>
        <span className="w-4 shrink-0" />
        <span className="pl-0.5">Task name</span>
      </div>
      <div className={cn(CELL, head, "bg-surface")}>Assignee</div>
      <div className={cn(CELL, head, "bg-surface")}>Due date</div>
      {fields.map((f) => (
        <div key={f.id} className={cn(CELL, head, "gap-1.5 bg-surface")} title={f.name}>
          <FieldTypeIcon type={f.type} size={13} className="text-faint" />
          <span className="truncate">{f.name}</span>
        </div>
      ))}
      <div className={cn(CELL, "justify-center bg-surface px-0")}>
        <Tooltip content="Manage fields">
          <Link
            href={routes.project(projectId, "workflow")}
            aria-label="Manage fields"
            className="flex h-6 w-6 items-center justify-center rounded text-faint hover:bg-surface-2 hover:text-text"
          >
            <Settings2 size={14} />
          </Link>
        </Tooltip>
      </div>
    </div>
  );
}

function ListSection({
  section,
  tasks,
  total,
  collapsed,
  onToggle,
  canEdit,
  actions,
  sectionCount,
  onAddTask,
  composer,
  children,
}: {
  section: Section;
  tasks: TaskItem[];
  total: number;
  collapsed: boolean;
  onToggle: () => void;
  canEdit: boolean;
  actions: SectionActions;
  sectionCount: number;
  onAddTask: () => void;
  composer: React.ReactNode;
  children: (task: TaskItem) => React.ReactNode;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: sectionDndId(section.id),
    disabled: !canEdit,
  });

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      aria-label={section.name}
    >
      <div className="group/section flex h-12 items-end pb-1">
        <div className="sticky left-0 flex min-w-0 items-center gap-0.5 pl-1 sm:pl-3">
          {canEdit ? (
            <button
              ref={setActivatorNodeRef}
              type="button"
              {...attributes}
              {...guardDragListeners(listeners)}
              aria-label="Drag to move section"
              className="flex h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint opacity-60 active:cursor-grabbing sm:opacity-0 sm:group-hover/section:opacity-100 sm:focus-visible:opacity-100"
            >
              <GripVertical size={13} />
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${section.name}` : `Collapse ${section.name}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
          <div className="max-w-[min(420px,55vw)] min-w-0 text-[15px]">
            <SectionName section={section} actions={actions} canEdit={canEdit} />
          </div>
          <span className="ml-1.5 shrink-0 text-[12px] text-faint tabular-nums">{total}</span>
          {canEdit && (
            <div className="ml-1 flex items-center sm:opacity-0 sm:group-hover/section:opacity-100 sm:focus-within:opacity-100">
              <Tooltip content="Add task">
                <Button variant="ghost" size="icon-sm" onClick={onAddTask} aria-label={`Add task to ${section.name}`}>
                  <Plus size={15} />
                </Button>
              </Tooltip>
              <SectionMenu section={section} actions={actions} sectionCount={sectionCount} />
            </div>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="border-t border-border">
          <SortableContext items={tasks.map((t) => taskDndId(t.id))} strategy={verticalListSortingStrategy}>
            {tasks.map((t) => children(t))}
          </SortableContext>
          {composer}
        </div>
      )}
    </section>
  );
}

function AddTaskRow({ onCreate, focusSignal }: { onCreate: (name: string) => void; focusSignal: number }) {
  return (
    <div className={ROW_GRID}>
      <div className={cn(NAME_CELL, "gap-1.5 bg-surface")}>
        <span className="w-4 shrink-0" />
        <Plus size={14} className="mx-px shrink-0 text-faint" />
        <AddTaskInput onCreate={onCreate} focusSignal={focusSignal} />
      </div>
      <div className="border-b border-border [grid-column:2/-1]" />
    </div>
  );
}
