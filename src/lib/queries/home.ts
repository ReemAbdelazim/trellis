"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "./keys";

const supabase = () => createClient();

/**
 * People I share projects with, most shared projects first.
 * Returns user ids with the number of shared projects (excluding me).
 */
export function useCollaborators(userId: string) {
  return useQuery({
    queryKey: qk.collaborators(userId),
    queryFn: async (): Promise<{ userId: string; shared: number }[]> => {
      const sb = supabase();
      const { data: mine, error } = await sb.from("project_members").select("project_id").eq("user_id", userId);
      if (error) throw error;
      const ids = mine.map((m) => m.project_id);
      if (!ids.length) return [];
      const { data: others, error: err2 } = await sb
        .from("project_members")
        .select("user_id, project_id")
        .in("project_id", ids)
        .neq("user_id", userId)
        .limit(5000);
      if (err2) throw err2;
      const counts = new Map<string, number>();
      for (const r of others) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
      return [...counts.entries()].map(([id, shared]) => ({ userId: id, shared })).sort((a, b) => b.shared - a.shared);
    },
    staleTime: 5 * 60_000,
  });
}

/** Ids of projects I'm an explicit member of. */
export function useMyProjectIds(userId: string) {
  return useQuery({
    queryKey: qk.myProjectIds(userId),
    queryFn: async () => {
      const { data, error } = await supabase().from("project_members").select("project_id").eq("user_id", userId);
      if (error) throw error;
      return data.map((r) => r.project_id);
    },
  });
}
