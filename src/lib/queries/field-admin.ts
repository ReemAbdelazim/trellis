"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, nextPosition } from "@/lib/utils";
import { qk } from "./keys";
import type { Json } from "@/types/database";
import type { CustomField, FieldConfig, FieldType } from "@/types/models";

const supabase = () => createClient();

/** Create / update / delete / reorder a project's custom fields (project editors only — RLS enforced). */
export function useCreateField(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; type: FieldType; config: FieldConfig }) => {
      const existing = qc.getQueryData<CustomField[]>(qk.customFields(projectId)) ?? [];
      const { data, error } = await supabase()
        .from("custom_fields")
        .insert({
          project_id: projectId,
          name: input.name,
          type: input.type,
          config: input.config as unknown as NonNullable<Json>,
          position: nextPosition(existing),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (field) => {
      qc.setQueryData<CustomField[]>(qk.customFields(projectId), (list = []) =>
        [...list, field].sort((a, b) => a.position - b.position),
      );
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.customFields(projectId) }),
  });
}

export function useUpdateField(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      removedOptionIds,
      ...patch
    }: { id: string; name?: string; config?: FieldConfig; position?: number; removedOptionIds?: string[] }) => {
      const sb = supabase();
      const { error } = await sb
        .from("custom_fields")
        .update({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.position !== undefined ? { position: patch.position } : {}),
          ...(patch.config !== undefined ? { config: patch.config as unknown as NonNullable<Json> } : {}),
        })
        .eq("id", id);
      if (error) throw error;
      if (removedOptionIds?.length) await clearRemovedOptions(id, removedOptionIds);
    },
    onMutate: async ({ id, removedOptionIds: _r, ...patch }) => {
      void _r;
      await qc.cancelQueries({ queryKey: qk.customFields(projectId) });
      const prev = qc.getQueryData<CustomField[]>(qk.customFields(projectId));
      qc.setQueryData<CustomField[]>(qk.customFields(projectId), (list = []) =>
        list
          .map((f) =>
            f.id === id
              ? {
                  ...f,
                  ...(patch.name !== undefined ? { name: patch.name } : {}),
                  ...(patch.position !== undefined ? { position: patch.position } : {}),
                  ...(patch.config !== undefined ? { config: patch.config as unknown as NonNullable<Json> } : {}),
                }
              : f,
          )
          .sort((a, b) => a.position - b.position),
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.customFields(projectId), ctx.prev);
      toast.error(errorMessage(err));
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: qk.customFields(projectId) });
      if (v.removedOptionIds?.length) {
        qc.invalidateQueries({ queryKey: qk.fieldValues(projectId) });
        qc.invalidateQueries({ queryKey: ["task-field-values"] });
      }
    },
  });
}

/**
 * Strip deleted select options out of stored values so they don't linger as dangling ids.
 * Single select → row removed; multi select → id removed from the array (row removed when empty).
 */
async function clearRemovedOptions(fieldId: string, removed: string[]) {
  const sb = supabase();
  const { data, error } = await sb.from("task_field_values").select("task_id, value").eq("field_id", fieldId);
  if (error) throw error;
  const gone = new Set(removed);
  for (const row of data) {
    const v = row.value;
    if (typeof v === "string" && gone.has(v)) {
      const { error: e } = await sb.from("task_field_values").delete().eq("task_id", row.task_id).eq("field_id", fieldId);
      if (e) throw e;
    } else if (Array.isArray(v) && v.some((x) => typeof x === "string" && gone.has(x))) {
      const next = v.filter((x) => !(typeof x === "string" && gone.has(x)));
      const q = next.length
        ? sb.from("task_field_values").update({ value: next }).eq("task_id", row.task_id).eq("field_id", fieldId)
        : sb.from("task_field_values").delete().eq("task_id", row.task_id).eq("field_id", fieldId);
      const { error: e } = await q;
      if (e) throw e;
    }
  }
}

export function useDeleteField(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("custom_fields").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => {
      const prev = qc.getQueryData<CustomField[]>(qk.customFields(projectId));
      qc.setQueryData<CustomField[]>(qk.customFields(projectId), (list = []) => list.filter((f) => f.id !== id));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.customFields(projectId), ctx.prev);
      toast.error(errorMessage(err));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.customFields(projectId) });
      qc.invalidateQueries({ queryKey: qk.fieldValues(projectId) });
      qc.invalidateQueries({ queryKey: ["task-field-values"] });
    },
  });
}
