"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "./keys";
import type { Team } from "@/types/models";

const supabase = () => createClient();

/** Every visible team, archived included (useTeams in people.ts hides archived ones). */
export function useAllTeams() {
  return useQuery({
    queryKey: [...qk.teams, "all"] as const,
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await supabase().from("teams").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

/** A single team (archived included) — `null` when it doesn't exist or isn't visible. */
export function useTeam(id: string | null | undefined) {
  return useQuery({
    queryKey: [...qk.teams, "one", id ?? ""] as const,
    enabled: !!id,
    queryFn: async (): Promise<Team | null> => {
      const { data, error } = await supabase().from("teams").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** owner/workspace admin, team creator, or a team member flagged as team admin. */
export function useIsTeamAdmin(teamId: string | null | undefined) {
  return useQuery({
    queryKey: [...qk.teams, "is-admin", teamId ?? ""] as const,
    enabled: !!teamId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase().rpc("is_team_admin", { p_team: teamId! });
      if (error) throw error;
      return !!data;
    },
    staleTime: 60_000,
  });
}

function invalidateTeams(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.teams });
  qc.invalidateQueries({ queryKey: qk.teamMembers() });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description: string; color: string }) => {
      const { data, error } = await supabase().from("teams").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSettled: () => invalidateTeams(qc),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: { id: string } & Partial<Pick<Team, "name" | "description" | "color" | "archived">>) => {
      const { data, error } = await supabase().from("teams").update(patch).eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Only team admins can change this team");
    },
    onSettled: () => invalidateTeams(qc),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase().from("teams").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Only workspace admins or the team's creator can delete it");
    },
    onSettled: () => {
      invalidateTeams(qc);
      qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}

/** Add a member (team admins), or join yourself (full members). */
export function useAddTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { teamId: string; userId: string }) => {
      const { error } = await supabase()
        .from("team_members")
        .upsert({ team_id: input.teamId, user_id: input.userId }, { onConflict: "team_id,user_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSettled: () => {
      invalidateTeams(qc);
      qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}

/** Remove a member (team admins), or leave (yourself). */
export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { teamId: string; userId: string }) => {
      const { data, error } = await supabase()
        .from("team_members")
        .delete()
        .eq("team_id", input.teamId)
        .eq("user_id", input.userId)
        .select("user_id");
      if (error) throw error;
      if (!data?.length) throw new Error("Only team admins can remove other members");
    },
    onSettled: () => {
      invalidateTeams(qc);
      qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}

export function useSetTeamAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { teamId: string; userId: string; isAdmin: boolean }) => {
      const { data, error } = await supabase()
        .from("team_members")
        .update({ is_admin: input.isAdmin })
        .eq("team_id", input.teamId)
        .eq("user_id", input.userId)
        .select("user_id");
      if (error) throw error;
      if (!data?.length) throw new Error("Only team admins can change that");
    },
    onSettled: () => invalidateTeams(qc),
  });
}
