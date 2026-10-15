"use client";

import { useMemo } from "react";
import { useMe } from "@/lib/queries/me";
import { useCanEditProject, useSections } from "@/lib/queries/projects";
import { qk } from "@/lib/queries/keys";
import { useRealtime } from "@/lib/queries/realtime";
import { newId, useCreateTask, useProjectTasks, useUpdateTask } from "@/lib/queries/tasks";
import { useTaskPane } from "@/lib/task-pane";
import { useLocalFlag } from "@/lib/use-local-storage";
import { nextPosition } from "@/lib/utils";
import { PageLoader } from "@/components/ui/misc";
import { MonthCalendar } from "../calendar/month-calendar";

export function ProjectCalendarView({ projectId }: { projectId: string }) {
  const me = useMe();
  const { openTask } = useTaskPane();
  const { data: tasks = [], isLoading } = useProjectTasks(projectId);
  const { data: sections = [] } = useSections(projectId);
  const canEdit = useCanEditProject(projectId);
  const update = useUpdateTask();
  const create = useCreateTask();
  const [showCompleted, setShowCompleted] = useLocalFlag("trellis:calendar:show-completed", true);

  useRealtime({ table: "tasks", filter: `project_id=eq.${projectId}`, invalidate: [qk.projectTasks(projectId)] });

  const visible = useMemo(() => (showCompleted ? tasks : tasks.filter((t) => !t.completed)), [tasks, showCompleted]);

  if (isLoading) return <PageLoader />;

  return (
    <MonthCalendar
      tasks={visible}
      readOnly={!canEdit}
      onOpenTask={openTask}
      onMoveTask={(id, dates) => update.mutate({ id, ...dates })}
      onCreate={(date, name) => {
        // New tasks land at the bottom of the first section, like quick-add elsewhere.
        const sectionId = sections[0]?.id ?? null;
        create.mutate({
          id: newId(),
          name,
          project_id: projectId,
          section_id: sectionId,
          due_date: date,
          position: nextPosition(tasks.filter((t) => t.section_id === sectionId)),
          created_by: me.id,
        });
      }}
      toolbarExtra={
        <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-muted select-none">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Show completed
        </label>
      }
    />
  );
}
