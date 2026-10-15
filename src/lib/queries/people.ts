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

const PHOTO_SIZE = 256;

/** True when the profile photo is one the person uploaded (not their Google picture). */
export const isUploadedPhoto = (url: string | null | undefined) => !!url?.includes("/storage/v1/object/public/avatars/");

/** Center-crops an image to a small square JPEG. */
async function squarePhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That image can't be read. Try a JPG or PNG.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PHOTO_SIZE;
  canvas
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("That image can't be read."))), "image/jpeg", 0.9),
  );
}

/** Uploads a new profile photo, or with `file: null` goes back to the Google picture (if any). */
export function useSetMyPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File | null }) => {
      const sb = supabase();
      const bucket = sb.storage.from("avatars");
      const { data: previous } = await bucket.list(id);
      let url: string | null;
      if (file) {
        const path = `${id}/${Date.now()}.jpg`;
        const { error } = await bucket.upload(path, await squarePhoto(file), { contentType: "image/jpeg" });
        if (error) throw error;
        url = bucket.getPublicUrl(path).data.publicUrl;
      } else {
        const { data } = await sb.auth.getUser();
        const meta = data.user?.user_metadata ?? {};
        url = meta.avatar_url ?? meta.picture ?? null;
      }
      const { error } = await sb.from("profiles").update({ avatar_url: url }).eq("id", id);
      if (error) throw error;
      const stale = (previous ?? []).map((f) => `${id}/${f.name}`).filter((p) => !url?.endsWith(p));
      if (stale.length) await bucket.remove(stale);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.profiles });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}
