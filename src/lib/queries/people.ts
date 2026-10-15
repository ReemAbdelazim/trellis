"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "./keys";
import type { OrgSettings, Profile, Team, TeamMember } from "@/types/models";

const supabase = () => createClient();

export function useProfiles() {
  return useQuery({
    queryKey: qk.profiles,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase().from("profiles").select("*").order("full_name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

/** Active people only, for pickers. */
export function useActiveProfiles() {
  const q = useProfiles();
  const data = useMemo(() => (q.data ?? []).filter((p) => p.status === "active"), [q.data]);
  return { ...q, data };
}

export function useProfileMap() {
  const { data } = useProfiles();
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p])), [data]);
}

export function useProfile(id: string | null | undefined) {
  const map = useProfileMap();
  return id ? map.get(id) : undefined;
}

export function useOrgSettings() {
  return useQuery({
    queryKey: qk.org,
    queryFn: async (): Promise<OrgSettings> => {
      const { data, error } = await supabase().from("org_settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useTeams() {
  return useQuery({
    queryKey: qk.teams,
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await supabase().from("teams").select("*").eq("archived", false).order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useTeamMembers() {
  return useQuery({
    queryKey: qk.teamMembers(),
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await supabase().from("team_members").select("*");
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Profile> & { id: string }) => {
      const { error } = await supabase()
        .from("profiles")
        .update({
          full_name: patch.full_name,
          title: patch.title,
          email_notifications: patch.email_notifications,
          email_prefs: patch.email_prefs,
          timezone: patch.timezone,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.profiles });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}
