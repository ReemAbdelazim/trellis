"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { qk } from "./keys";
import { TASK_COLUMNS, type TaskItem } from "./tasks";
import type { Task } from "@/types/models";

const supabase = () => createClient();

/**
 * Incomplete tasks overlapping a date window (inclusive, yyyy-MM-dd):
 * due within the window, or spanning it (start_date ≤ end and due_date ≥ start).
 * Lives under ["tasks", "range", ...] so global optimistic task patches apply.
 */
export function useTasksInRange(start: string, end: string, enabled = true) {
  return useQuery({
    queryKey: qk.tasksInRange(`${start}_${end}`),
    enabled,
    queryFn: async (): Promise<TaskItem[]> => {
      const { data, error } = await supabase()
        .from("tasks")
        .select(TASK_COLUMNS)
        .eq("completed", false)
        .gte("due_date", start)
        .or(`due_date.lte.${end},start_date.lte.${end}`)
        .order("due_date")
        .limit(5000);
      if (error) throw error;
      return (data as Task[]).map((t) => ({ ...t, subtask_count: 0, comment_count: 0 }));
    },
  });
}
