"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { nextPosition } from "@/lib/utils";
import { qk } from "./keys";
import type { Section } from "@/types/models";

const supabase = () => createClient();

/** Sections group either a project's tasks or a task's subtasks. */
export type SectionOwner = { projectId: string } | { taskId: string };

const isTaskOwner = (owner: SectionOwner): owner is { taskId: string } => "taskId" in owner;

/** The owner column and id a section row is filtered and inserted by. */
function ownerColumn(owner: SectionOwner) {
  return isTaskOwner(owner)
    ? ({ column: "task_id", id: owner.taskId } as const)
    : ({ column: "project_id", id: owner.projectId } as const);
}

export function sectionsKey(owner: SectionOwner) {
  const { column, id } = ownerColumn(owner);
  return qk.sections(column, id);
}

/** Query key of the tasks an owner's sections hold: the project's tasks or the task's subtasks. */
export function sectionTasksKey(owner: SectionOwner) {
  return isTaskOwner(owner) ? qk.subtasks(owner.taskId) : qk.projectTasks(owner.projectId);
}

/** Realtime filter for an owner's sections. */
export function sectionsFilter(owner: SectionOwner) {
  const { column, id } = ownerColumn(owner);
  return `${column}=eq.${id}`;
}

export function useSections(owner: SectionOwner | null) {
  return useQuery({
    queryKey: owner ? sectionsKey(owner) : ["sections", "none"],
    enabled: !!owner,
    queryFn: async (): Promise<Section[]> => {
      const { column, id } = ownerColumn(owner!);
      const { data, error } = await supabase().from("sections").select("*").eq(column, id).order("position");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateSection(owner: SectionOwner) {
  const qc = useQueryClient();
  const key = sectionsKey(owner);
  return useMutation({
    mutationFn: async (input: { name: string; position?: number }) => {
      const position = input.position ?? nextPosition(qc.getQueryData<Section[]>(key) ?? []);
      const ownerFields = isTaskOwner(owner) ? { task_id: owner.taskId } : { project_id: owner.projectId };
      const { data, error } = await supabase()
        .from("sections")
        .insert({ ...ownerFields, name: input.name, position })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (section) => {
      qc.setQueryData<Section[]>(key, (s = []) => [...s, section].sort((a, b) => a.position - b.position));
    },
  });
}

export function useUpdateSection(owner: SectionOwner) {
  const qc = useQueryClient();
  const key = sectionsKey(owner);
  return useMutation({
    mutationFn: async ({ id, ...patch }: Pick<Section, "id"> & Partial<Pick<Section, "name" | "position">>) => {
      const { error } = await supabase().from("sections").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, ...patch }) => {
      const prev = qc.getQueryData<Section[]>(key);
      qc.setQueryData<Section[]>(key, (s = []) =>
        s.map((x) => (x.id === id ? { ...x, ...patch } : x)).sort((a, b) => a.position - b.position),
      );
      return { prev };
    },
    // Callers show the error; just roll back here.
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
  });
}

export function useDeleteSection(owner: SectionOwner) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("sections").delete().eq("id", id);
      if (error) throw error;
    },
    // The database moves the section's tasks (to the first section, or out of any section).
    onSettled: () => {
      qc.invalidateQueries({ queryKey: sectionsKey(owner) });
      qc.invalidateQueries({ queryKey: sectionTasksKey(owner) });
    },
  });
}
