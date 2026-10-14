"use client";

import { useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { Columns3, Plus } from "lucide-react";
import { useCustomFields, useProjectFieldValues } from "@/lib/queries/fields";
import { useTaskPane } from "@/lib/task-pane";
import type { TaskItem } from "@/lib/queries/tasks";
import { Button } from "@/components/ui/button";
import { EmptyState, PageLoader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { Section } from "@/types/models";
import { TaskViewToolbar } from "../task-list/toolbar";
import { useProjectTasksView } from "../task-list/use-project-tasks-view";
import { sectionDndId, useSectionDnd } from "../task-list/use-section-dnd";
import { DeleteSectionDialog, useSectionActions } from "../task-list/section-controls";
import { useAddTask } from "../task-list/task-inputs";
import { BoardCard, BoardCardOverlay } from "../board/board-card";
import { BoardColumn, COLUMN_WIDTH } from "../board/board-column";

export function ProjectBoardView({ projectId }: { projectId: string }) {
  const view = useProjectTasksView(projectId);
  const { sections, tasksById, allBySection, canEdit, me } = view;
  const { taskId: openId, openTask } = useTaskPane();
  const { data: fields = [] } = useCustomFields(projectId);
  const { map: fieldValues } = useProjectFieldValues(projectId);
  const actions = useSectionActions(projectId, sections);
  const addTask = useAddTask(projectId, allBySection);
  const manual = view.options.sort === "manual";
  const dnd = useSectionDnd({ projectId, sections, groups: view.groups, tasksById, allBySection, manual });
  // Bumping `n` opens that column's composer.
  const [compose, setCompose] = useState<{ sectionId: string; n: number } | null>(null);

  if (view.loading) return <PageLoader />;

  const byId = new Map(sections.map((s) => [s.id, s]));
  const ordered = dnd.order.map((id) => byId.get(id)).filter((s): s is Section => !!s);
  const selectFields = fields.filter((f) => f.type === "single_select");

  const toolbar = (
    <TaskViewToolbar
      options={view.options}
      onOptionsChange={view.setOptions}
      search={view.search}
      onSearchChange={view.setSearch}
      assigneeIds={view.assigneeIds}
      onAddTask={
        canEdit && ordered.length
          ? () => setCompose((c) => ({ sectionId: ordered[0].id, n: (c?.n ?? 0) + 1 }))
          : undefined
      }
    />
  );

  if (!ordered.length) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {toolbar}
        <EmptyState
          icon={<Columns3 size={36} />}
          title="No sections yet"
          description={
            canEdit ? "Sections become the columns of your board — e.g. To do, Doing, Done." : "Nothing has been added to this project yet."
          }
          action={
            canEdit && (
              <Button variant="primary" onClick={() => actions.add()} disabled={actions.adding}>
                <Plus size={15} /> Add a section
              </Button>
            )
          }
          className="flex-1"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbar}
      {view.tasks.length > 0 && view.visibleCount === 0 && (
        <div className="px-4 pt-3 text-[13px] text-muted sm:px-6">
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
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin">
        <div className="flex h-full w-max items-start gap-3 px-4 py-3 sm:px-6">
          <DndContext {...dnd.context}>
            <SortableContext items={ordered.map((s) => sectionDndId(s.id))} strategy={horizontalListSortingStrategy}>
              {ordered.map((section) => {
                const ids = dnd.items[section.id] ?? [];
                return (
                  <BoardColumn
                    key={section.id}
                    section={section}
                    tasks={ids.map((id) => tasksById.get(id)).filter((t): t is TaskItem => !!t)}
                    total={ids.length}
                    canEdit={canEdit}
                    actions={actions}
                    sectionCount={ordered.length}
                    composeSignal={compose?.sectionId === section.id ? compose.n : 0}
                    onCreate={(name) => addTask(section.id, name)}
                  >
                    {(task) => (
                      <BoardCard
                        key={task.id}
                        task={task}
                        fields={selectFields}
                        values={fieldValues.get(task.id)}
                        selected={openId === task.id}
                        editable={canEdit || task.assignee_id === me.id || task.created_by === me.id}
                        draggable={canEdit}
                        onOpen={openTask}
                      />
                    )}
                  </BoardColumn>
                );
              })}
            </SortableContext>
            <DragOverlay>
              {dnd.activeTask ? (
                <BoardCardOverlay task={dnd.activeTask} fields={selectFields} values={fieldValues.get(dnd.activeTask.id)} />
              ) : dnd.activeSection ? (
                <div
                  className={cn(
                    "flex h-11 items-center rounded-xl bg-surface-2 px-3 text-[14px] font-semibold shadow-pop",
                    COLUMN_WIDTH,
                  )}
                >
                  <span className="truncate">{dnd.activeSection.name || "Untitled section"}</span>
                  <span className="ml-auto pl-2 text-[12px] font-normal text-faint tabular-nums">
                    {dnd.items[dnd.activeSection.id]?.length ?? 0}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          {canEdit && (
            <button
              type="button"
              onClick={() => actions.add()}
              disabled={actions.adding}
              className={cn(
                "flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-border-strong px-3 text-[13.5px] text-muted hover:bg-surface-2 hover:text-text disabled:opacity-60",
                COLUMN_WIDTH,
              )}
            >
              <Plus size={15} /> Add section
            </button>
          )}
        </div>
      </div>
      <DeleteSectionDialog actions={actions} sections={ordered} taskCount={(id) => allBySection.get(id)?.length ?? 0} />
    </div>
  );
}
