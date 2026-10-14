"use client";

import { useMemo, useState } from "react";
import { useMe } from "@/lib/queries/me";
import { useProfileMap } from "@/lib/queries/people";
import { useCanEditProject, useSections } from "@/lib/queries/projects";
import { useProjectTasks } from "@/lib/queries/tasks";
import { useRealtime } from "@/lib/queries/realtime";
import { qk } from "@/lib/queries/keys";
import { groupTasks, tasksBySection, useViewOptions } from "./view-options";

/**
 * Everything the list and board views share: data, live updates, toolbar
 * state and the filtered/sorted grouping by section.
 */
export function useProjectTasksView(projectId: string) {
  const me = useMe();
  const people = useProfileMap();
  const canEdit = useCanEditProject(projectId);
  const sectionsQ = useSections(projectId);
  const tasksQ = useProjectTasks(projectId);
  const [options, setOptions] = useViewOptions(projectId);
  const [search, setSearch] = useState("");

  useRealtime({
    table: "tasks",
    filter: `project_id=eq.${projectId}`,
    // Field values have no project column to filter on; task edits are a good enough nudge.
    invalidate: [qk.projectTasks(projectId), qk.fieldValues(projectId)],
  });
  useRealtime({ table: "sections", filter: `project_id=eq.${projectId}`, invalidate: [qk.sections(projectId)] });

  const sections = useMemo(() => sectionsQ.data ?? [], [sectionsQ.data]);
  const tasks = useMemo(() => tasksQ.data ?? [], [tasksQ.data]);

  const visible = useMemo(
    () => groupTasks(tasks, sections, options, search, me.id, people),
    [tasks, sections, options, search, me.id, people],
  );
  const groups = useMemo(() => {
    const ids: Record<string, string[]> = {};
    for (const key of Object.keys(visible)) ids[key] = visible[key].map((t) => t.id);
    return ids;
  }, [visible]);
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const allBySection = useMemo(() => tasksBySection(tasks, sections), [tasks, sections]);
  const assigneeIds = useMemo(
    () => [...new Set(tasks.map((t) => t.assignee_id).filter((id): id is string => !!id))],
    [tasks],
  );

  const visibleCount = Object.values(groups).reduce((n, ids) => n + ids.length, 0);

  return {
    me,
    canEdit,
    loading: sectionsQ.isLoading || tasksQ.isLoading,
    sections,
    tasks,
    tasksById,
    allBySection,
    groups,
    assigneeIds,
    options,
    setOptions,
    search,
    setSearch,
    visibleCount,
  };
}
