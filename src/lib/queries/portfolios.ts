"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";
import type { Database } from "@/types/database";
import type { Portfolio, PortfolioProject, ProjectStats } from "@/types/models";

const supabase = () => createClient();

export type PortfolioMember = Database["public"]["Tables"]["portfolio_members"]["Row"];

/** A portfolio with its project links and members embedded. */
export type PortfolioItem = Portfolio & {
  projects: Pick<PortfolioProject, "project_id" | "position">[];
  members: PortfolioMember[];
};

const SELECT = "*, projects:portfolio_projects(project_id, position), members:portfolio_members(*)";

function normalize(row: PortfolioItem): PortfolioItem {
  return {
    ...row,
    projects: [...(row.projects ?? [])].sort((a, b) => a.position - b.position),
    members: row.members ?? [],
  };
}

const canEditKey = (id: string) => [...qk.portfolio(id), "can-edit"] as const;
const latestStatusKey = (ids: string[]) => ["project-status-updates", "latest", [...ids].sort().join(",")] as const;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Portfolios visible to the user (RLS: full members; private ones only for owner/members/admins). */
export function usePortfolios(enabled = true) {
  return useQuery({
    queryKey: qk.portfolios,
    enabled,
    queryFn: async (): Promise<PortfolioItem[]> => {
      const { data, error } = await supabase().from("portfolios").select(SELECT).order("name");
      if (error) throw error;
      return (data as unknown as PortfolioItem[]).map(normalize);
    },
  });
}

export function usePortfolio(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.portfolio(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<PortfolioItem | null> => {
      const { data, error } = await supabase().from("portfolios").select(SELECT).eq("id", id!).maybeSingle();
      if (error) throw error;
      return data ? normalize(data as unknown as PortfolioItem) : null;
    },
  });
}

export function useCanEditPortfolio(id: string | null | undefined) {
  const { data } = useQuery({
    queryKey: canEditKey(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase().rpc("can_edit_portfolio", { p_portfolio: id! });
      if (error) throw error;
      return !!data;
    },
    staleTime: 60_000,
  });
  return !!data;
}

/** Latest status-update timestamp per project (for portfolio tables). */
export function useLatestProjectStatusDates(projectIds: string[]) {
  return useQuery({
    queryKey: latestStatusKey(projectIds),
    enabled: projectIds.length > 0,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase()
        .from("project_status_updates")
        .select("project_id, created_at")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of data) if (!map.has(row.project_id)) map.set(row.project_id, row.created_at);
      return map;
    },
  });
}

/** Aggregate task-completion progress (0–100) across projects. */
export function aggregateProgress(projectIds: string[], stats: Map<string, ProjectStats> | undefined) {
  let total = 0;
  let done = 0;
  for (const id of projectIds) {
    const s = stats?.get(id);
    total += s?.total_tasks ?? 0;
    done += s?.completed_tasks ?? 0;
  }
  return total === 0 ? 0 : Math.max(0, Math.min(100, (done / total) * 100));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function useInvalidate() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: qk.portfolios });
    if (id) qc.invalidateQueries({ queryKey: qk.portfolio(id) });
  };
}

export function useCreatePortfolio() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { name: string; color: string; is_private: boolean; owner_id: string }) => {
      const { data, error } = await supabase().from("portfolios").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdatePortfolio() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Pick<Portfolio, "name" | "color" | "is_private" | "owner_id">> & { id: string }) => {
      const { data, error } = await supabase().from("portfolios").update(patch).eq("id", id).select().maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You don't have permission to edit this portfolio");
    },
    onMutate: ({ id, ...patch }) => {
      const prev = qc.getQueryData<PortfolioItem | null>(qk.portfolio(id));
      if (prev) qc.setQueryData(qk.portfolio(id), { ...prev, ...patch });
      return { prev };
    },
    onError: (err, { id }, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.portfolio(id), ctx.prev);
      toast.error(errorMessage(err));
    },
    onSettled: (_d, _e, { id }) => invalidate(id),
  });
}

export function useDeletePortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("portfolios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      qc.setQueryData<PortfolioItem[]>(qk.portfolios, (list) => list?.filter((p) => p.id !== id));
      qc.removeQueries({ queryKey: qk.portfolio(id) });
      qc.invalidateQueries({ queryKey: qk.portfolios });
    },
  });
}

/** Add, remove, or reposition a project in a portfolio. */
export function useSetPortfolioProject(portfolioId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { projectId: string; position: number | null }) => {
      const sb = supabase();
      if (input.position === null) {
        const { error } = await sb
          .from("portfolio_projects")
          .delete()
          .eq("portfolio_id", portfolioId)
          .eq("project_id", input.projectId);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("portfolio_projects")
          .upsert({ portfolio_id: portfolioId, project_id: input.projectId, position: input.position });
        if (error) throw error;
      }
    },
    onMutate: async ({ projectId, position }) => {
      await qc.cancelQueries({ queryKey: qk.portfolio(portfolioId) });
      const prev = qc.getQueryData<PortfolioItem | null>(qk.portfolio(portfolioId));
      if (prev) {
        const rest = prev.projects.filter((p) => p.project_id !== projectId);
        const projects =
          position === null
            ? rest
            : [...rest, { project_id: projectId, position }].sort((a, b) => a.position - b.position);
        qc.setQueryData(qk.portfolio(portfolioId), { ...prev, projects });
      }
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.portfolio(portfolioId), ctx.prev);
      toast.error(errorMessage(err));
    },
    onSettled: () => invalidate(portfolioId),
  });
}

/** Add/update a member (`canEdit` boolean) or remove them (`canEdit: null`). */
export function useSetPortfolioMember(portfolioId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { userId: string; canEdit: boolean | null }) => {
      const sb = supabase();
      if (input.canEdit === null) {
        const { error } = await sb
          .from("portfolio_members")
          .delete()
          .eq("portfolio_id", portfolioId)
          .eq("user_id", input.userId);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("portfolio_members")
          .upsert({ portfolio_id: portfolioId, user_id: input.userId, can_edit: input.canEdit });
        if (error) throw error;
      }
    },
    onMutate: async ({ userId, canEdit }) => {
      await qc.cancelQueries({ queryKey: qk.portfolio(portfolioId) });
      const prev = qc.getQueryData<PortfolioItem | null>(qk.portfolio(portfolioId));
      if (prev) {
        const rest = prev.members.filter((m) => m.user_id !== userId);
        const members =
          canEdit === null ? rest : [...rest, { portfolio_id: portfolioId, user_id: userId, can_edit: canEdit }];
        qc.setQueryData(qk.portfolio(portfolioId), { ...prev, members });
      }
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.portfolio(portfolioId), ctx.prev);
      toast.error(errorMessage(err));
    },
    onSettled: () => {
      invalidate(portfolioId);
      qc.invalidateQueries({ queryKey: canEditKey(portfolioId) });
    },
  });
}
