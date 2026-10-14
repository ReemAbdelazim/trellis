"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";
import { useRealtime } from "./realtime";
import type { Notification } from "@/types/models";

const supabase = () => createClient();

export function useNotifications(view: "active" | "archived" = "active") {
  return useQuery({
    queryKey: [...qk.notifications, view],
    queryFn: async (): Promise<Notification[]> => {
      let q = supabase().from("notifications").select("*").order("created_at", { ascending: false }).limit(200);
      q = view === "active" ? q.is("archived_at", null) : q.not("archived_at", "is", null);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useUnreadCount(userId: string) {
  useRealtime({ table: "notifications", filter: `user_id=eq.${userId}`, invalidate: [qk.notifications] });
  return useQuery({
    queryKey: qk.unreadCount,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase()
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null)
        .is("archived_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 120_000,
  });
}

/** Names of the tasks / goals that notifications point at (one query each). */
export interface NotificationTargets {
  tasks: Map<string, { id: string; name: string; project_id: string | null; completed: boolean }>;
  goals: Map<string, { id: string; name: string }>;
}

export function useNotificationTargets(notifications: Notification[] | undefined) {
  const taskIds = [...new Set((notifications ?? []).map((n) => n.task_id).filter(Boolean) as string[])].sort();
  const goalIds = [...new Set((notifications ?? []).map((n) => n.goal_id).filter(Boolean) as string[])].sort();
  return useQuery({
    queryKey: [...qk.notifications, "targets", taskIds, goalIds],
    enabled: taskIds.length + goalIds.length > 0,
    queryFn: async (): Promise<NotificationTargets> => {
      const sb = supabase();
      const [tasks, goals] = await Promise.all([
        taskIds.length
          ? sb.from("tasks").select("id, name, project_id, completed").in("id", taskIds)
          : Promise.resolve({ data: [], error: null }),
        goalIds.length ? sb.from("goals").select("id, name").in("id", goalIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (tasks.error) throw tasks.error;
      return {
        tasks: new Map((tasks.data ?? []).map((t) => [t.id, t])),
        // Guests can't read goals; a failed lookup just falls back to "a goal".
        goals: new Map((goals.error ? [] : (goals.data ?? [])).map((g) => [g.id, g])),
      };
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

type NotificationPatch = Partial<Pick<Notification, "read_at" | "archived_at">>;

export function useUpdateNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[] | "all"; patch: NotificationPatch }) => {
      let q = supabase().from("notifications").update(patch);
      if (ids === "all") {
        q = q.is("archived_at", null);
        // "Mark all read" must not bump the read time of already-read rows.
        if (patch.read_at && patch.archived_at === undefined) q = q.is("read_at", null);
      } else {
        if (!ids.length) return;
        q = q.in("id", ids);
      }
      const { error } = await q;
      if (error) throw error;
    },
    onMutate: async ({ ids, patch }) => {
      await qc.cancelQueries({ queryKey: qk.notifications });
      const snap = qc.getQueriesData({ queryKey: qk.notifications });
      const hit = (n: Notification) => (ids === "all" ? !n.archived_at : ids.includes(n.id));
      const apply = (n: Notification): Notification => {
        const next = { ...n, ...patch };
        // Keep the original read time when marking something read again.
        if (patch.read_at && n.read_at) next.read_at = n.read_at;
        return next;
      };
      for (const [key, data] of snap) {
        if (!Array.isArray(data)) continue;
        const view = key[key.length - 1];
        const list = (data as Notification[]).map((n) => (hit(n) ? apply(n) : n));
        qc.setQueryData(
          key,
          view === "active" ? list.filter((n) => !n.archived_at) : view === "archived" ? list.filter((n) => n.archived_at) : list,
        );
      }
      return { snap };
    },
    onError: (err, _v, ctx) => {
      ctx?.snap.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(errorMessage(err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}
