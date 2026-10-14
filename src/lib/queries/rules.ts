"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/utils";
import { qk } from "./keys";
import type { Json } from "@/types/database";
import type { Rule, RuleAction, RuleTrigger } from "@/types/models";

const supabase = () => createClient();

/** Keys understood by `run_rules` per trigger (see migrations/…_logic.sql). */
export interface RuleTriggerConfig {
  section_id?: string;
  user_id?: string;
  field_id?: string;
  option_id?: string;
}

export interface RuleInput {
  name: string;
  enabled?: boolean;
  trigger_type: RuleTrigger;
  trigger_config: RuleTriggerConfig;
  actions: RuleAction[];
}

const ACTION_TYPES = new Set<RuleAction["type"]>([
  "move_to_section",
  "set_complete",
  "set_assignee",
  "set_due_in_days",
  "add_follower",
  "add_comment",
  "set_field",
]);

export function ruleActions(rule: Pick<Rule, "actions">): RuleAction[] {
  if (!Array.isArray(rule.actions)) return [];
  return rule.actions.filter(
    (a) => !!a && typeof a === "object" && !Array.isArray(a) && ACTION_TYPES.has(a.type as RuleAction["type"]),
  ) as unknown as RuleAction[];
}

export function ruleTriggerConfig(rule: Pick<Rule, "trigger_config">): RuleTriggerConfig {
  const c = rule.trigger_config;
  if (!c || typeof c !== "object" || Array.isArray(c)) return {};
  const out: RuleTriggerConfig = {};
  for (const k of ["section_id", "user_id", "field_id", "option_id"] as const) {
    const v = (c as Record<string, unknown>)[k];
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}

export function useRules(projectId: string | null | undefined) {
  return useQuery({
    queryKey: qk.rules(projectId ?? ""),
    enabled: !!projectId,
    queryFn: async (): Promise<Rule[]> => {
      const { data, error } = await supabase()
        .from("rules")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

function toRow(input: Partial<RuleInput>) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.trigger_type !== undefined ? { trigger_type: input.trigger_type } : {}),
    ...(input.trigger_config !== undefined ? { trigger_config: input.trigger_config as unknown as NonNullable<Json> } : {}),
    ...(input.actions !== undefined ? { actions: input.actions as unknown as NonNullable<Json> } : {}),
  };
}

export function useCreateRule(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RuleInput) => {
      const { data, error } = await supabase()
        .from("rules")
        .insert({ project_id: projectId, name: input.name, trigger_type: input.trigger_type, ...toRow(input) })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (rule) => qc.setQueryData<Rule[]>(qk.rules(projectId), (list = []) => [...list, rule]),
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.rules(projectId) }),
  });
}

export function useUpdateRule(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<RuleInput> & { id: string }) => {
      const { error } = await supabase().from("rules").update(toRow(patch)).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: qk.rules(projectId) });
      const prev = qc.getQueryData<Rule[]>(qk.rules(projectId));
      qc.setQueryData<Rule[]>(qk.rules(projectId), (list = []) =>
        list.map((r) => (r.id === id ? { ...r, ...toRow(patch) } : r)),
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.rules(projectId), ctx.prev);
      toast.error(errorMessage(err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.rules(projectId) }),
  });
}

export function useDeleteRule(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("rules").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: (id) => {
      const prev = qc.getQueryData<Rule[]>(qk.rules(projectId));
      qc.setQueryData<Rule[]>(qk.rules(projectId), (list = []) => list.filter((r) => r.id !== id));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.rules(projectId), ctx.prev);
      toast.error(errorMessage(err));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.rules(projectId) }),
  });
}
