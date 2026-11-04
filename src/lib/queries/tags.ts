"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, paletteColorFor } from "@/lib/utils";
import { qk } from "./keys";
import { patchTaskInCaches, restoreTasks, snapshotTasks, type TaskItem } from "./tasks";
import type { Tag } from "@/types/models";

const supabase = () => createClient();

const byName = (a: Tag, b: Tag) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

/** Every tag the user can see, by name. */
export function useTags() {
  return useQuery({
    queryKey: qk.tags,
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase().from("tags").select("*");
      if (error) throw error;
      return data.sort(byName);
    },
    staleTime: 60_000,
  });
}

export function useTagMap() {
  const { data } = useTags();
  return useMemo(() => new Map((data ?? []).map((t) => [t.id, t])), [data]);
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase()
        .from("tags")
        // A stable starting colour per name, so new tags don't all look alike.
        .insert({ name: name.trim(), color: paletteColorFor(name.trim().toLowerCase()) })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (tag) => qc.setQueryData<Tag[]>(qk.tags, (list = []) => [...list, tag].sort(byName)),
    onError: (err) =>
      toast.error(/duplicate key/i.test(errorMessage(err)) ? "A tag with that name already exists" : errorMessage(err)),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Pick<Tag, "id"> & Partial<Pick<Tag, "name" | "color">>) => {
      const { error } = await supabase().from("tags").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: ({ id, ...patch }) => {
      const prev = qc.getQueryData<Tag[]>(qk.tags);
      qc.setQueryData<Tag[]>(qk.tags, (list = []) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)).sort(byName));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.tags, ctx.prev);
      toast.error(/duplicate key/i.test(errorMessage(err)) ? "A tag with that name already exists" : errorMessage(err));
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.tags });
      qc.invalidateQueries({ queryKey: qk.tasks });
    },
  });
}

/** Add or remove one tag on a task, updating every cached copy of the task at once. */
export function useSetTaskTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ task, tagId, on }: { task: Pick<TaskItem, "id" | "tag_ids">; tagId: string; on: boolean }) => {
      const table = supabase().from("task_tags");
      const { error } = on
        ? await table.insert({ task_id: task.id, tag_id: tagId })
        : await table.delete().eq("task_id", task.id).eq("tag_id", tagId);
      if (error) throw error;
    },
    onMutate: ({ task, tagId, on }) => {
      const snap = snapshotTasks(qc);
      const tag_ids = on ? [...new Set([...task.tag_ids, tagId])] : task.tag_ids.filter((id) => id !== tagId);
      patchTaskInCaches(qc, task.id, { tag_ids });
      return { snap };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.snap) restoreTasks(qc, ctx.snap);
      toast.error(errorMessage(err));
    },
    onSettled: (_d, _e, { task }) => qc.invalidateQueries({ queryKey: qk.activity(task.id) }),
  });
}
