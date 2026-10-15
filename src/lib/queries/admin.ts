"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { callFunction } from "@/lib/functions";
import { qk } from "./keys";
import type { Invitation, OrgSettings, Profile, UserRole } from "@/types/models";

const supabase = () => createClient();

/** Turns raw DB guard / RLS messages into something people can act on. */
function friendlyDbError(err: unknown): Error {
  const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err ?? "");
  if (/at least one active admin/i.test(msg)) return new Error("The workspace must keep at least one active admin");
  if (/only admins can change roles/i.test(msg)) return new Error("Only admins can change roles or account status");
  if (/row-level security/i.test(msg)) return new Error("You don't have permission to do that");
  return err instanceof Error ? err : new Error(msg || "Something went wrong");
}

export function useInvitations(enabled = true) {
  return useQuery({
    queryKey: qk.invitations,
    enabled,
    queryFn: async (): Promise<Invitation[]> => {
      const { data, error } = await supabase()
        .from("invitations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase().from("invitations").delete().eq("id", id).select("id");
      if (error) throw friendlyDbError(error);
      if (!data?.length) throw new Error("You can only revoke invitations you sent");
    },
    onMutate: (id) => {
      qc.setQueryData<Invitation[]>(qk.invitations, (list) => list?.filter((i) => i.id !== id));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.invitations }),
  });
}

/** Admin-only change of another person's role or status (RLS + guard trigger enforce it). */
export function useSetProfileAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; role?: UserRole; status?: Profile["status"] }) => {
      const { data, error } = await supabase().from("profiles").update(patch).eq("id", id).select("id");
      if (error) throw friendlyDbError(error);
      if (!data?.length) throw new Error("You don't have permission to do that");
    },
    onMutate: ({ id, ...patch }) => {
      const prev = qc.getQueryData<Profile[]>(qk.profiles);
      qc.setQueryData<Profile[]>(qk.profiles, (list) => list?.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.profiles, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.profiles }),
  });
}

export function useRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await callFunction("admin", { action: "remove-user", userId });
    },
    onSuccess: (_d, userId) => {
      qc.setQueryData<Profile[]>(qk.profiles, (list) => list?.filter((p) => p.id !== userId));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.profiles });
      qc.invalidateQueries({ queryKey: qk.teamMembers() });
    },
  });
}

export function useUpdateOrgSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<OrgSettings, "name" | "allowed_domains" | "allow_member_invites">>) => {
      const { data, error } = await supabase()
        .from("org_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", 1)
        .select("id");
      if (error) throw friendlyDbError(error);
      if (!data?.length) throw new Error("Only admins can change workspace settings");
    },
    onMutate: (patch) => {
      const prev = qc.getQueryData<OrgSettings>(qk.org);
      if (prev) qc.setQueryData<OrgSettings>(qk.org, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.org, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.org }),
  });
}

export interface EmailStatus {
  /** Gmail sender and app URL are set as function secrets. */
  emailConfigured: boolean;
  /** The scheduled database jobs know where to send notifications. */
  deliveryConnected: boolean;
  connectedAt: string | null;
  appUrl: string | null;
}

export const emailStatusKey = ["admin", "email-status"] as const;

export function useEmailStatus(enabled = true) {
  return useQuery({
    queryKey: emailStatusKey,
    enabled,
    queryFn: () => callFunction<EmailStatus>("admin", { action: "email-status" }),
    staleTime: 30_000,
  });
}
