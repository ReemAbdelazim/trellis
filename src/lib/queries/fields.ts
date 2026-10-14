"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";
import type { Json } from "@/types/database";
import type { CustomField, TaskFieldValue } from "@/types/models";

const supabase = () => createClient();

export function useCustomFields(projectId: string | null | undefined) {
  return useQuery({
    queryKey: qk.customFields(projectId ?? ""),
    enabled: !!projectId,
    queryFn: async (): Promise<CustomField[]> => {
      const { data, error } = await supabase()
        .from("custom_fields")
        .select("*")
        .eq("project_id", projectId!)
        .order("position");
      if (error) throw error;
      return data;
    },
  });
}

/** All values for every task in a project, as Map<taskId, Map<fieldId, value>>. */
export function useProjectFieldValues(projectId: string | null | undefined) {
  const q = useQuery({
    queryKey: qk.fieldValues(projectId ?? ""),
    enabled: !!projectId,
    queryFn: async (): Promise<TaskFieldValue[]> => {
      const { data, error } = await supabase()
        .from("task_field_values")
        .select("*, custom_fields!inner(project_id)")
        .eq("custom_fields.project_id", projectId!);
      if (error) throw error;
      return (data as (TaskFieldValue & { custom_fields: unknown })[]).map((row) => ({
        task_id: row.task_id,
        field_id: row.field_id,
        value: row.value,
        updated_at: row.updated_at,
      }));
    },
  });
  const map = useMemo(() => {
    const m = new Map<string, Map<string, Json | null>>();
    for (const v of q.data ?? []) {
      if (!m.has(v.task_id)) m.set(v.task_id, new Map());
      m.get(v.task_id)!.set(v.field_id, v.value);
    }
    return m;
  }, [q.data]);
  return { ...q, map };
}

export function useTaskFieldValues(taskId: string | null | undefined) {
  return useQuery({
    queryKey: qk.taskFieldValues(taskId ?? ""),
    enabled: !!taskId,
    queryFn: async (): Promise<TaskFieldValue[]> => {
      const { data, error } = await supabase().from("task_field_values").select("*").eq("task_id", taskId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useSetFieldValue(projectId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, fieldId, value }: { taskId: string; fieldId: string; value: Json | null }) => {
      const sb = supabase();
      if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) {
        const { error } = await sb.from("task_field_values").delete().eq("task_id", taskId).eq("field_id", fieldId);
        if (error) throw error;
      } else {
        const { error } = await sb.from("task_field_values").upsert({ task_id: taskId, field_id: fieldId, value });
        if (error) throw error;
      }
    },
    onMutate: ({ taskId, fieldId, value }) => {
      const patch = (list?: TaskFieldValue[]) => {
        const rest = (list ?? []).filter((v) => !(v.task_id === taskId && v.field_id === fieldId));
        return value === null ? rest : [...rest, { task_id: taskId, field_id: fieldId, value, updated_at: new Date().toISOString() }];
      };
      qc.setQueryData<TaskFieldValue[]>(qk.taskFieldValues(taskId), patch);
      if (projectId) qc.setQueryData<TaskFieldValue[]>(qk.fieldValues(projectId), patch);
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: (_d, _e, { taskId }) => {
      qc.invalidateQueries({ queryKey: qk.taskFieldValues(taskId) });
      if (projectId) qc.invalidateQueries({ queryKey: qk.fieldValues(projectId) });
      // Rules may have changed the task itself.
      qc.invalidateQueries({ queryKey: qk.task(taskId) });
      qc.invalidateQueries({ queryKey: qk.tasks });
    },
  });
}
