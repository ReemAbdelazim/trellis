"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "./keys";
import type { TaskDependency } from "@/types/models";

/**
 * Every dependency whose blocked task belongs to the project.
 * (The blocking task may live elsewhere; callers filter to what they can draw.)
 */
export function useProjectDependencies(projectId: string | null | undefined) {
  return useQuery({
    queryKey: qk.projectDependencies(projectId ?? ""),
    enabled: !!projectId,
    queryFn: async (): Promise<TaskDependency[]> => {
      const { data, error } = await createClient()
        .from("task_dependencies")
        .select("task_id, depends_on_id, created_at, blocked:tasks!task_dependencies_task_id_fkey!inner(project_id)")
        .eq("blocked.project_id", projectId!);
      if (error) throw error;
      return ((data ?? []) as unknown as TaskDependency[]).map(({ task_id, depends_on_id, created_at }) => ({
        task_id,
        depends_on_id,
        created_at,
      }));
    },
  });
}
