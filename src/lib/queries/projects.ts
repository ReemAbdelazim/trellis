"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "./keys";
import { toast } from "sonner";
import { errorMessage, nextPosition } from "@/lib/utils";
import type {
  Project,
  ProjectInsert,
  ProjectMember,
  ProjectRole,
  ProjectStats,
  ProjectStatusUpdate,
  ProjectUpdate,
  Section,
  StatusColor,
} from "@/types/models";

const supabase = () => createClient();

/** All projects visible to the user (RLS-filtered), including archived. */
export function useProjects() {
  return useQuery({
    queryKey: qk.projects,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase().from("projects").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useProject(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.project(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<Project | null> => {
      const { data, error } = await supabase().from("projects").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useProjectStats() {
  return useQuery({
    queryKey: qk.projectStats,
    queryFn: async (): Promise<Map<string, ProjectStats>> => {
      const { data, error } = await supabase().rpc("project_stats");
      if (error) throw error;
      return new Map(data.map((s) => [s.project_id, s]));
    },
  });
}

/** owner | editor | commenter | viewer | null */
export function useProjectAccess(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.projectAccess(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<ProjectRole | null> => {
      const { data, error } = await supabase().rpc("project_access", { p_project: id! });
      if (error) throw error;
      return (data as ProjectRole | null) ?? null;
    },
    staleTime: 60_000,
  });
}

export function useCanEditProject(id: string | null | undefined) {
  const { data } = useProjectAccess(id);
  return data === "owner" || data === "editor";
}

export function useProjectMembers(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.projectMembers(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<ProjectMember[]> => {
      const { data, error } = await supabase().from("project_members").select("*").eq("project_id", id!);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<ProjectInsert, "created_by"> & { created_by: string }) => {
      const { data, error } = await supabase().from("projects").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projects });
      qc.invalidateQueries({ queryKey: qk.allMyProjectIds });
    },
  });
}

export function useDuplicateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; name: string; includeTasks?: boolean; asTemplate?: boolean }) => {
      const { data, error } = await supabase().rpc("duplicate_project", {
        p_project: input.projectId,
        p_name: input.name,
        p_include_tasks: input.includeTasks ?? true,
        p_as_template: input.asTemplate ?? false,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projects });
      qc.invalidateQueries({ queryKey: qk.allMyProjectIds });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: ProjectUpdate & { id: string }) => {
      const { error } = await supabase().from("projects").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: qk.project(id) });
      const prev = qc.getQueryData<Project | null>(qk.project(id));
      if (prev) qc.setQueryData(qk.project(id), { ...prev, ...patch });
      qc.setQueryData<Project[]>(qk.projects, (list) => list?.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      return { prev };
    },
    onError: (_e, { id }, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.project(id), ctx.prev);
      qc.invalidateQueries({ queryKey: qk.projects });
    },
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: qk.project(id) });
      qc.invalidateQueries({ queryKey: qk.projects });
      qc.invalidateQueries({ queryKey: qk.projectAccess(id) });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}

export function useSetProjectMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; userId: string; role: ProjectRole | null }) => {
      const sb = supabase();
      if (input.role === null) {
        const { error } = await sb
          .from("project_members")
          .delete()
          .eq("project_id", input.projectId)
          .eq("user_id", input.userId);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("project_members")
          .upsert({ project_id: input.projectId, user_id: input.userId, role: input.role });
        if (error) throw error;
      }
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: qk.projectMembers(v.projectId) });
      qc.invalidateQueries({ queryKey: qk.allProjectMemberships });
      qc.invalidateQueries({ queryKey: qk.allMyProjectIds });
      qc.invalidateQueries({ queryKey: qk.projectAccess(v.projectId) });
      qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------
export function useFavorites() {
  return useQuery({
    queryKey: qk.favorites,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase().from("project_favorites").select("project_id, position").order("position");
      if (error) throw error;
      return data.map((f) => f.project_id);
    },
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, favorite }: { projectId: string; favorite: boolean }) => {
      const sb = supabase();
      if (favorite) {
        const { error } = await sb.from("project_favorites").insert({ project_id: projectId, position: Date.now() });
        if (error) throw error;
      } else {
        const { error } = await sb.from("project_favorites").delete().eq("project_id", projectId);
        if (error) throw error;
      }
    },
    onMutate: ({ projectId, favorite }) => {
      const prev = qc.getQueryData<string[]>(qk.favorites);
      qc.setQueryData<string[]>(qk.favorites, (f = []) =>
        favorite ? [...f, projectId] : f.filter((id) => id !== projectId),
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      qc.setQueryData(qk.favorites, ctx?.prev);
      toast.error(errorMessage(err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.favorites }),
  });
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
export function useSections(projectId: string | null | undefined) {
  return useQuery({
    queryKey: qk.sections(projectId ?? ""),
    enabled: !!projectId,
    queryFn: async (): Promise<Section[]> => {
      const { data, error } = await supabase()
        .from("sections")
        .select("*")
        .eq("project_id", projectId!)
        .order("position");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateSection(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; position?: number }) => {
      const existing = qc.getQueryData<Section[]>(qk.sections(projectId)) ?? [];
      const { data, error } = await supabase()
        .from("sections")
        .insert({ project_id: projectId, name: input.name, position: input.position ?? nextPosition(existing) })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (section) => {
      qc.setQueryData<Section[]>(qk.sections(projectId), (s = []) =>
        [...s, section].sort((a, b) => a.position - b.position),
      );
    },
  });
}

export function useUpdateSection(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Section> & { id: string }) => {
      const { error } = await supabase().from("sections").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, ...patch }) => {
      const prev = qc.getQueryData<Section[]>(qk.sections(projectId));
      qc.setQueryData<Section[]>(qk.sections(projectId), (s = []) =>
        s.map((x) => (x.id === id ? { ...x, ...patch } : x)).sort((a, b) => a.position - b.position),
      );
      return { prev };
    },
    // Callers show the error; just roll back here.
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.sections(projectId), ctx.prev);
    },
  });
}

export function useDeleteSection(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("sections").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.sections(projectId) });
      qc.invalidateQueries({ queryKey: qk.projectTasks(projectId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Status updates
// ---------------------------------------------------------------------------
export function useProjectStatusUpdates(projectId: string) {
  return useQuery({
    queryKey: qk.projectStatusUpdates(projectId),
    queryFn: async (): Promise<ProjectStatusUpdate[]> => {
      const { data, error } = await supabase()
        .from("project_status_updates")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function usePostStatusUpdate(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { status: StatusColor; title: string; body: string; author_id: string }) => {
      const { error } = await supabase()
        .from("project_status_updates")
        .insert({ project_id: projectId, ...input });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projectStatusUpdates(projectId) });
      qc.invalidateQueries({ queryKey: qk.allLatestStatusUpdates });
      qc.invalidateQueries({ queryKey: qk.project(projectId) });
      qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}
