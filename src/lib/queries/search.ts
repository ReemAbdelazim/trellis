"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Goal, Task } from "@/types/models";

const supabase = () => createClient();

/** A task search hit with its project's name/colour for display. */
export type TaskHit = Pick<
  Task,
  "id" | "name" | "project_id" | "parent_id" | "assignee_id" | "due_date" | "start_date" | "completed" | "is_milestone"
> & { project: { id: string; name: string; color: string } | null };

export type GoalHit = Pick<Goal, "id" | "name" | "status" | "time_period">;

const HIT_SELECT =
  "id, name, project_id, parent_id, assignee_id, due_date, start_date, completed, is_milestone, project:projects(id, name, color)";

/** Debounce a fast-changing value (e.g. a search box). */
export function useDebounced<T>(value: T, ms = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Escape LIKE wildcards so user input is matched literally. */
export function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Quick name match on tasks (used by the command palette). */
export function useTaskNameSearch(q: string, limit = 10) {
  const term = q.trim();
  return useQuery({
    queryKey: ["search", "tasks-quick", term, limit],
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<TaskHit[]> => {
      const { data, error } = await supabase()
        .from("tasks")
        .select(HIT_SELECT)
        .ilike("name", likePattern(term))
        .order("completed")
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as unknown as TaskHit[];
    },
    staleTime: 15_000,
  });
}

export function useGoalSearch(q: string, enabled = true, limit = 5) {
  const term = q.trim();
  return useQuery({
    queryKey: ["search", "goals", term, limit],
    enabled: enabled && term.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GoalHit[]> => {
      const { data, error } = await supabase()
        .from("goals")
        .select("id, name, status, time_period")
        .ilike("name", likePattern(term))
        .order("name")
        .limit(limit);
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}

export interface TaskSearchFilters {
  q: string;
  includeCompleted: boolean;
  assigneeId: string | null;
  projectId: string | null;
}

/**
 * Full task search: Postgres full text (`search` tsvector, websearch syntax)
 * merged with a substring match on the name so partial words still hit.
 */
export function useTaskSearch(filters: TaskSearchFilters, limit = 100) {
  const term = filters.q.trim();
  const active = term.length > 0 || !!filters.assigneeId || !!filters.projectId;
  return useQuery({
    queryKey: ["search", "tasks", term, filters.includeCompleted, filters.assigneeId, filters.projectId, limit],
    enabled: active,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<TaskHit[]> => {
      const base = () => {
        let q = supabase().from("tasks").select(HIT_SELECT);
        if (!filters.includeCompleted) q = q.eq("completed", false);
        if (filters.assigneeId) q = q.eq("assignee_id", filters.assigneeId);
        if (filters.projectId) q = q.eq("project_id", filters.projectId);
        return q;
      };
      if (!term) {
        const { data, error } = await base().order("updated_at", { ascending: false }).limit(limit);
        if (error) throw error;
        return data as unknown as TaskHit[];
      }
      const [fts, like] = await Promise.all([
        base()
          .textSearch("search", term, { type: "websearch", config: "simple" })
          .order("updated_at", { ascending: false })
          .limit(limit),
        base().ilike("name", likePattern(term)).order("updated_at", { ascending: false }).limit(limit),
      ]);
      // Malformed websearch input can error — the name match still answers.
      if (like.error && fts.error) throw like.error;
      const seen = new Set<string>();
      const out: TaskHit[] = [];
      for (const row of [...((fts.data ?? []) as unknown as TaskHit[]), ...((like.data ?? []) as unknown as TaskHit[])]) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
      }
      return out.slice(0, limit);
    },
    staleTime: 15_000,
  });
}

/** Names of a set of tasks (e.g. parents of subtasks), keyed by id. */
export function useTaskNames(ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["task-names", sorted],
    enabled: sorted.length > 0,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase().from("tasks").select("id, name").in("id", sorted);
      if (error) throw error;
      return new Map(data.map((t) => [t.id, t.name]));
    },
    staleTime: 60_000,
  });
}
