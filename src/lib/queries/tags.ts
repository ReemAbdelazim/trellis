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

type TaggedTask = Pick<TaskItem, "id" | "tag_ids">;

/** Add or remove one tag on one or more tasks, updating every cached copy at once. */
export function useSetTaskTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tasks, tagId, on }: { tasks: TaggedTask[]; tagId: string; on: boolean }) => {
      const table = supabase().from("task_tags");
      const missing = tasks.filter((t) => !t.tag_ids.includes(tagId));
      const { error } = on
        ? missing.length
          ? await table.insert(missing.map((t) => ({ task_id: t.id, tag_id: tagId })))
          : { error: null }
        : await table.delete().eq("tag_id", tagId).in("task_id", tasks.map((t) => t.id));
      if (error) throw error;
    },
    onMutate: ({ tasks, tagId, on }) => {
      const snap = snapshotTasks(qc);
      for (const t of tasks) {
        const tag_ids = on ? [...new Set([...t.tag_ids, tagId])] : t.tag_ids.filter((id) => id !== tagId);
        patchTaskInCaches(qc, t.id, { tag_ids });
      }
      return { snap };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.snap) restoreTasks(qc, ctx.snap);
      toast.error(errorMessage(err));
    },
    onSettled: (_d, _e, { tasks }) => tasks.forEach((t) => qc.invalidateQueries({ queryKey: qk.activity(t.id) })),
  });
}
