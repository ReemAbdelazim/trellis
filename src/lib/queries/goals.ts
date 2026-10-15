"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";
import { useProjectStats } from "./projects";
import type { Database } from "@/types/database";
import type { Goal, GoalStatusUpdate, ProjectStats, StatusColor } from "@/types/models";

const supabase = () => createClient();

export type GoalInsert = Database["public"]["Tables"]["goals"]["Insert"];
export type GoalUpdate = Database["public"]["Tables"]["goals"]["Update"];
export type GoalProjectLink = Database["public"]["Tables"]["goal_projects"]["Row"];

export type ProgressSource = "manual" | "subgoals" | "projects";
export type MetricUnit = "percent" | "number" | "currency";

export const PROGRESS_SOURCE_LABEL: Record<ProgressSource, string> = {
  manual: "Manual (metric value)",
  subgoals: "Sub-goals (average)",
  projects: "Linked projects (task completion)",
};

export const METRIC_UNIT_LABEL: Record<MetricUnit, string> = {
  percent: "Percent",
  number: "Number",
  currency: "Currency ($)",
};

/** Keys live under ["goals", ...] / ["goal", id, ...] so `qk.goals` invalidates every goal list. */
const goalLinksKey = [...qk.goals, "project-links"] as const;
const goalUpdatesKey = (id: string) => [...qk.goal(id), "status-updates"] as const;

// ---------------------------------------------------------------------------
// Progress (one shared implementation)
// ---------------------------------------------------------------------------

export interface ProgressContext {
  /** parent goal id → child goals */
  childrenOf: Map<string, Goal[]>;
  /** goal id → linked project ids */
  projectsOf: Map<string, string[]>;
  /** project id → stats (RLS-filtered view) */
  stats: Map<string, ProjectStats>;
}

const clampPct = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0);

/** Progress of a metric from start → target, as 0–100. */
function metricProgress(start: number, current: number, target: number) {
  const span = Number(target) - Number(start);
  if (span === 0) return Number(current) >= Number(target) ? 100 : 0;
  return clampPct(((Number(current) - Number(start)) / span) * 100);
}

/** Task completion across projects, as 0–100. */
export function projectsProgress(projectIds: string[], stats: Map<string, ProjectStats>) {
  let total = 0;
  let done = 0;
  for (const id of projectIds) {
    const s = stats.get(id);
    total += s?.total_tasks ?? 0;
    done += s?.completed_tasks ?? 0;
  }
  return total === 0 ? 0 : clampPct((done / total) * 100);
}

/**
 * Goal progress 0–100:
 * - manual   → (current − start) / (target − start)
 * - subgoals → average of child goals' progress (recursive)
 * - projects → completed / total top-level tasks across linked projects
 */
export function goalProgress(goal: Goal, ctx: ProgressContext, seen: Set<string> = new Set()): number {
  if (seen.has(goal.id)) return 0; // cycle guard
  const visited = new Set(seen).add(goal.id);
  switch (goal.progress_source as ProgressSource) {
    case "subgoals": {
      const kids = ctx.childrenOf.get(goal.id) ?? [];
      if (kids.length === 0) return 0;
      const sum = kids.reduce((acc, k) => acc + goalProgress(k, ctx, visited), 0);
      return clampPct(sum / kids.length);
    }
    case "projects":
      return projectsProgress(ctx.projectsOf.get(goal.id) ?? [], ctx.stats);
    default:
      return metricProgress(goal.metric_start, goal.metric_current, goal.metric_target);
  }
}

function buildProgressContext(
  goals: Goal[],
  links: GoalProjectLink[],
  stats: Map<string, ProjectStats>,
): ProgressContext {
  const childrenOf = new Map<string, Goal[]>();
  for (const g of goals) {
    if (!g.parent_id) continue;
    const list = childrenOf.get(g.parent_id) ?? [];
    list.push(g);
    childrenOf.set(g.parent_id, list);
  }
  const projectsOf = new Map<string, string[]>();
  for (const l of links) {
    const list = projectsOf.get(l.goal_id) ?? [];
    list.push(l.project_id);
    projectsOf.set(l.goal_id, list);
  }
  return { childrenOf, projectsOf, stats };
}

/** Map of goal id → progress (0–100) for every visible goal, plus the context used. */
export function useGoalProgressMap() {
  const { data: goals } = useGoals();
  const { data: links } = useGoalProjectLinks();
  const { data: stats } = useProjectStats();
  return useMemo(() => {
    const ctx = buildProgressContext(goals ?? [], links ?? [], stats ?? new Map());
    const map = new Map<string, number>();
    for (const g of goals ?? []) map.set(g.id, goalProgress(g, ctx));
    return { map, ctx };
  }, [goals, links, stats]);
}

export function formatMetric(value: number, unit: string) {
  const n = Number(value);
  if (unit === "percent") return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  if (unit === "currency")
    return n.toLocaleString(undefined, { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Free-text time period suggestions around the current date. */
export function timePeriodSuggestions(now = new Date()) {
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  const out: string[] = [];
  for (let i = 0; i < 4; i++) {
    const qq = ((q - 1 + i) % 4) + 1;
    const yy = y + Math.floor((q - 1 + i) / 4);
    out.push(`Q${qq} ${yy}`);
  }
  out.push(`H${now.getMonth() < 6 ? 1 : 2} ${y}`, `FY ${y}`, `FY ${y + 1}`);
  return out;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** All goals (RLS: full members only; guests get an empty list). */
export function useGoals(enabled = true) {
  return useQuery({
    queryKey: qk.goals,
    enabled,
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await supabase().from("goals").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useGoal(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.goal(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<Goal | null> => {
      const { data, error } = await supabase().from("goals").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Every goal ↔ project link (small table) — used for progress and the detail page. */
function useGoalProjectLinks() {
  return useQuery({
    queryKey: goalLinksKey,
    queryFn: async (): Promise<GoalProjectLink[]> => {
      const { data, error } = await supabase().from("goal_projects").select("*");
      if (error) throw error;
      return data;
    },
  });
}

export function useGoalStatusUpdates(goalId: string) {
  return useQuery({
    queryKey: goalUpdatesKey(goalId),
    queryFn: async (): Promise<GoalStatusUpdate[]> => {
      const { data, error } = await supabase()
        .from("goal_status_updates")
        .select("*")
        .eq("goal_id", goalId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GoalInsert & { created_by: string }) => {
      const { data, error } = await supabase().from("goals").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (goal) => {
      qc.setQueryData<Goal[]>(qk.goals, (list) => (list ? [...list, goal] : list));
      qc.invalidateQueries({ queryKey: qk.goals });
    },
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: GoalUpdate & { id: string }) => {
      const { data, error } = await supabase().from("goals").update(patch).eq("id", id).select().maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You don't have permission to edit this goal");
      return data;
    },
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: qk.goal(id) });
      const prevOne = qc.getQueryData<Goal | null>(qk.goal(id));
      const prevList = qc.getQueryData<Goal[]>(qk.goals);
      if (prevOne) qc.setQueryData(qk.goal(id), { ...prevOne, ...patch });
      qc.setQueryData<Goal[]>(qk.goals, (list) => list?.map((g) => (g.id === id ? { ...g, ...patch } : g)));
      return { prevOne, prevList };
    },
    onError: (err, { id }, ctx) => {
      if (ctx?.prevOne) qc.setQueryData(qk.goal(id), ctx.prevOne);
      if (ctx?.prevList) qc.setQueryData(qk.goals, ctx.prevList);
      toast.error(errorMessage(err));
    },
    onSuccess: (row) => {
      qc.setQueryData(qk.goal(row.id), row);
      qc.setQueryData<Goal[]>(qk.goals, (list) => list?.map((g) => (g.id === row.id ? row : g)));
    },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      qc.setQueryData<Goal[]>(qk.goals, (list) =>
        list?.filter((g) => g.id !== id).map((g) => (g.parent_id === id ? { ...g, parent_id: null } : g)),
      );
      qc.removeQueries({ queryKey: qk.goal(id) });
      qc.invalidateQueries({ queryKey: qk.goals });
    },
  });
}

export function useLinkGoalProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ goalId, projectId, linked }: { goalId: string; projectId: string; linked: boolean }) => {
      const sb = supabase();
      if (linked) {
        const { error } = await sb.from("goal_projects").upsert({ goal_id: goalId, project_id: projectId });
        if (error) throw error;
      } else {
        const { error } = await sb.from("goal_projects").delete().eq("goal_id", goalId).eq("project_id", projectId);
        if (error) throw error;
      }
    },
    onMutate: async ({ goalId, projectId, linked }) => {
      await qc.cancelQueries({ queryKey: goalLinksKey });
      const prev = qc.getQueryData<GoalProjectLink[]>(goalLinksKey);
      qc.setQueryData<GoalProjectLink[]>(goalLinksKey, (list = []) => {
        const rest = list.filter((l) => !(l.goal_id === goalId && l.project_id === projectId));
        return linked ? [...rest, { goal_id: goalId, project_id: projectId }] : rest;
      });
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(goalLinksKey, ctx.prev);
      toast.error(errorMessage(err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: goalLinksKey }),
  });
}

export function usePostGoalUpdate(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { status: StatusColor; body: string; author_id: string }) => {
      const { error } = await supabase().from("goal_status_updates").insert({ goal_id: goalId, ...input });
      if (error) throw error;
    },
    onSuccess: (_d, input) => {
      // The DB trigger copies the status onto the goal.
      qc.setQueryData<Goal | null>(qk.goal(goalId), (g) => (g ? { ...g, status: input.status } : g));
      qc.setQueryData<Goal[]>(qk.goals, (list) =>
        list?.map((g) => (g.id === goalId ? { ...g, status: input.status } : g)),
      );
      qc.invalidateQueries({ queryKey: goalUpdatesKey(goalId) });
      qc.invalidateQueries({ queryKey: qk.goal(goalId) });
    },
  });
}

export function useDeleteGoalUpdate(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("goal_status_updates").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: goalUpdatesKey(goalId) }),
  });
}
