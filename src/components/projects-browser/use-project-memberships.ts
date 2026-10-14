"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "@/lib/queries/keys";

/**
 * Every project membership the user can see (RLS limits it to visible projects),
 * grouped by project. Kept under the `project-members` key prefix so member edits
 * elsewhere invalidate it.
 */
export function useProjectMemberships() {
  const q = useQuery({
    queryKey: [...qk.projectMembers("all")] as const,
    queryFn: async () => {
      const { data, error } = await createClient().from("project_members").select("project_id, user_id");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
  const byProject = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const m of q.data ?? []) {
      const set = map.get(m.project_id) ?? new Set<string>();
      set.add(m.user_id);
      map.set(m.project_id, set);
    }
    return map;
  }, [q.data]);
  return { ...q, byProject };
}
