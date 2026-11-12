"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";
import { callFunction } from "@/lib/functions";
import { TASK_COLUMNS } from "./tasks";
import type { Attachment, Comment, Task, TaskActivity } from "@/types/models";

const supabase = () => createClient();

export function useComments(taskId: string) {
  return useQuery({
    queryKey: qk.comments(taskId),
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase().from("comments").select("*").eq("task_id", taskId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Mentions are read from the @[Name](id) tokens in the body by the database.
    mutationFn: async (input: { body: string; author_id: string }) => {
      const { data, error } = await supabase()
        .from("comments")
        .insert({ task_id: taskId, ...input })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (c) => {
      qc.setQueryData<Comment[]>(qk.comments(taskId), (list = []) => [...list.filter((x) => x.id !== c.id), c]);
      qc.invalidateQueries({ queryKey: qk.followers(taskId) });
      qc.setQueriesData<Task[]>({ queryKey: qk.tasks }, (list) =>
        Array.isArray(list)
          ? list.map((t) => (t.id === taskId && "comment_count" in t ? { ...t, comment_count: (t as { comment_count: number }).comment_count + 1 } : t))
          : list,
      );
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useEditComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { error } = await supabase().from("comments").update({ body }).eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.comments(taskId) }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("comments").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => qc.setQueryData<Comment[]>(qk.comments(taskId), (l = []) => l.filter((c) => c.id !== id)),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.comments(taskId) }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useActivity(taskId: string) {
  return useQuery({
    queryKey: qk.activity(taskId),
    queryFn: async (): Promise<TaskActivity[]> => {
      const { data, error } = await supabase()
        .from("task_activity")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

/** Ids of everyone who can see a task, i.e. who a comment on it can mention. */
export function useTaskAudience(taskId: string) {
  return useQuery({
    queryKey: qk.taskAudience(taskId),
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase().rpc("task_audience", { p_task: taskId });
      if (error) throw error;
      return new Set(data);
    },
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Followers & likes: the same shape, a set of people attached to a task
// ---------------------------------------------------------------------------
const TASK_PEOPLE = {
  followers: { table: "task_followers", key: qk.followers },
  likes: { table: "task_likes", key: qk.likes },
} as const;
type TaskPeopleKind = keyof typeof TASK_PEOPLE;

/** Ids of the people who follow (or like) a task. */
export function useTaskPeople(kind: TaskPeopleKind, taskId: string) {
  const { table, key } = TASK_PEOPLE[kind];
  return useQuery({
    queryKey: key(taskId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase().from(table).select("user_id").eq("task_id", taskId);
      if (error) throw error;
      return data.map((r) => r.user_id);
    },
  });
}

/** Add or remove one person, optimistically; the list is restored if the server refuses. */
export function useSetTaskPerson(kind: TaskPeopleKind, taskId: string) {
  const qc = useQueryClient();
  const { table, key } = TASK_PEOPLE[kind];
  const queryKey = key(taskId);
  return useMutation({
    mutationFn: async ({ userId, on }: { userId: string; on: boolean }) => {
      const q = supabase().from(table);
      const { error } = on
        ? await q.insert({ task_id: taskId, user_id: userId })
        : await q.delete().eq("task_id", taskId).eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: async ({ userId, on }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<string[]>(queryKey);
      qc.setQueryData<string[]>(queryKey, (l = []) => (on ? [...new Set([...l, userId])] : l.filter((x) => x !== userId)));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      qc.setQueryData(queryKey, ctx?.previous);
      toast.error(errorMessage(err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------
export type DependencyInfo = { blockedBy: Task[]; blocking: Task[] };

export function useDependencies(taskId: string) {
  return useQuery({
    queryKey: qk.dependencies(taskId),
    queryFn: async (): Promise<DependencyInfo> => {
      const sb = supabase();
      const [a, b] = await Promise.all([
        sb.from("task_dependencies").select("depends_on_id").eq("task_id", taskId),
        sb.from("task_dependencies").select("task_id").eq("depends_on_id", taskId),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      const ids = [...a.data.map((d) => d.depends_on_id), ...b.data.map((d) => d.task_id)];
      if (!ids.length) return { blockedBy: [], blocking: [] };
      const { data: tasks, error } = await sb.from("tasks").select(TASK_COLUMNS).in("id", ids);
      if (error) throw error;
      const byId = new Map(tasks.map((t) => [t.id, t]));
      return {
        blockedBy: a.data.map((d) => byId.get(d.depends_on_id)).filter(Boolean) as Task[],
        blocking: b.data.map((d) => byId.get(d.task_id)).filter(Boolean) as Task[],
      };
    },
  });
}

export function useSetDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, dependsOnId, add }: { taskId: string; dependsOnId: string; add: boolean }) => {
      const q = supabase().from("task_dependencies");
      const { error } = add
        ? await q.insert({ task_id: taskId, depends_on_id: dependsOnId })
        : await q.delete().eq("task_id", taskId).eq("depends_on_id", dependsOnId);
      if (error) throw error;
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: qk.dependencies(v.taskId) });
      qc.invalidateQueries({ queryKey: qk.dependencies(v.dependsOnId) });
      qc.invalidateQueries({ queryKey: qk.allProjectDependencies });
    },
    onError: (err) => toast.error(/cycle/i.test(errorMessage(err)) ? "That would create a circular dependency" : errorMessage(err)),
  });
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------
export function useAttachments(taskId: string) {
  return useQuery({
    queryKey: qk.attachments(taskId),
    queryFn: async (): Promise<Attachment[]> => {
      const { data, error } = await supabase()
        .from("attachments")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

const MAX_BYTES = 50 * 1024 * 1024;

type UploadTarget = { backend: "supabase" } | { backend: "r2"; key: string; url: string };

/** Stores the file in R2 when the `files` function is configured for it, else in Supabase Storage. */
async function storeFile(taskId: string, file: File): Promise<{ path: string; backend: "supabase" | "r2" }> {
  const target = await callFunction<UploadTarget>("files", {
    action: "upload-url",
    taskId,
    fileName: file.name,
    size: file.size,
  });
  if (target.backend === "r2") {
    const res = await fetch(target.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return { path: target.key, backend: "r2" };
  }
  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const path = `${taskId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase().storage.from("attachments").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return { path, backend: "supabase" };
}

export function useUploadAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, uploaderId }: { file: File; uploaderId: string }) => {
      if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than 50 MB`);
      const stored = await storeFile(taskId, file);
      const { error } = await supabase().from("attachments").insert({
        task_id: taskId,
        uploader_id: uploaderId,
        file_name: file.name,
        storage_path: stored.path,
        storage_backend: stored.backend,
        mime_type: file.type || null,
        size_bytes: file.size,
      });
      if (error) {
        if (stored.backend === "supabase") await supabase().storage.from("attachments").remove([stored.path]);
        throw error;
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.attachments(taskId) });
      qc.invalidateQueries({ queryKey: qk.activity(taskId) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: Attachment) => {
      if (a.storage_backend === "r2") {
        await callFunction("files", { action: "delete", attachmentId: a.id });
        return;
      }
      const sb = supabase();
      const { error } = await sb.from("attachments").delete().eq("id", a.id);
      if (error) throw error;
      await sb.storage.from("attachments").remove([a.storage_path]);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.attachments(taskId) }),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Short-lived link to view or download an attachment. */
export async function attachmentUrl(a: Attachment, download = false) {
  if (a.storage_backend === "r2") {
    const { url } = await callFunction<{ url: string }>("files", { action: "download-url", attachmentId: a.id, download });
    return url;
  }
  const { data, error } = await supabase()
    .storage.from("attachments")
    .createSignedUrl(a.storage_path, 60 * 10, download ? { download: a.file_name } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
