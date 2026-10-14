"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2, Wand2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, EmptyState, Spinner } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { ManagerCard } from "@/components/fields/manager-bits";
import { Switch } from "@/components/fields/field-meta";
import { useCustomFields } from "@/lib/queries/fields";
import { useMe } from "@/lib/queries/me";
import { useProfileMap } from "@/lib/queries/people";
import { useSections } from "@/lib/queries/projects";
import {
  ruleActions,
  ruleTriggerConfig,
  useCreateRule,
  useDeleteRule,
  useRules,
  useUpdateRule,
  type RuleInput,
} from "@/lib/queries/rules";
import { cn } from "@/lib/utils";
import type { Rule, RuleTrigger, Section } from "@/types/models";
import { RuleDialog } from "./rule-dialog";
import { describeRule, validateRule, type RuleContext } from "./rule-logic";

function toInput(r: Rule): RuleInput {
  return {
    name: r.name,
    enabled: r.enabled,
    trigger_type: r.trigger_type as RuleTrigger,
    trigger_config: ruleTriggerConfig(r),
    actions: ruleActions(r),
  };
}

interface Template {
  id: string;
  label: string;
  /** Null → the template can't be used; `reason` explains why. */
  build: () => RuleInput | null;
  reason: string;
}

export function RulesManager({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const me = useMe();
  const { data: rules = [], isLoading } = useRules(projectId);
  const { data: sections = [] } = useSections(projectId);
  const { data: fields = [] } = useCustomFields(projectId);
  const people = useProfileMap();
  const create = useCreateRule(projectId);
  const update = useUpdateRule(projectId);
  const del = useDeleteRule(projectId);

  const ctx: RuleContext = useMemo(() => ({ sections, fields, people }), [sections, fields, people]);

  const [dialog, setDialog] = useState<{ rule: Rule | null; key: number } | null>(null);
  const [confirm, setConfirm] = useState<Rule | null>(null);

  const templates = useMemo(() => buildTemplates(sections, me.id, me.full_name), [sections, me.id, me.full_name]);
  const existingNames = new Set(rules.map((r) => r.name.trim().toLowerCase()));

  return (
    <ManagerCard
      id="workflow-rules"
      title="Rules"
      description="Automate busywork: when something happens to a task, do something for you."
      action={
        canEdit && (
          <Button variant="primary" onClick={() => setDialog({ rule: null, key: Date.now() })}>
            <Plus size={14} /> Add rule
          </Button>
        )
      }
    >
      {canEdit && (
        <div className="border-b border-border px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Wand2 size={13} /> Quick start
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((t) => {
              const built = t.build();
              const exists = !!built && existingNames.has(built.name.trim().toLowerCase());
              const disabledReason = !built ? t.reason : exists ? "This rule already exists" : null;
              const btn = (
                <button
                  type="button"
                  disabled={!!disabledReason || create.isPending}
                  onClick={() => built && create.mutate({ ...built, enabled: true })}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-[13px]",
                    "hover:border-accent hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-border disabled:hover:bg-surface",
                  )}
                >
                  <Zap size={14} className="mt-0.5 shrink-0 text-accent" />
                  <span className="min-w-0">
                    <span className="block">{t.label}</span>
                    {disabledReason && <span className="block text-[11px] text-faint">{disabledReason}</span>}
                  </span>
                </button>
              );
              return <div key={t.id}>{btn}</div>;
            })}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          className="py-10"
          icon={<Zap size={28} />}
          title="No rules yet"
          description={
            canEdit
              ? "Start from a quick-start template above or build your own."
              : "Project editors can add rules to automate this project."
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {rules.map((r) => {
            const input = toInput(r);
            const problems = validateRule(input, ctx);
            return (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                <div className="pt-0.5">
                  <Switch
                    checked={r.enabled}
                    disabled={!canEdit}
                    label={r.enabled ? `Disable ${r.name}` : `Enable ${r.name}`}
                    onChange={(enabled) => update.mutate({ id: r.id, enabled })}
                  />
                </div>
                <div className={cn("min-w-0 flex-1", !r.enabled && "opacity-60")}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    {problems.length > 0 && (
                      <Tooltip content={problems.join(" ")}>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                          <AlertTriangle size={11} /> Needs attention
                        </span>
                      </Tooltip>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] break-words text-muted">{describeRule(input, ctx)}.</p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Edit ${r.name}`}
                      onClick={() => setDialog({ rule: r, key: Date.now() })}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => setConfirm(r)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dialog && (
        <RuleDialog
          key={dialog.key}
          projectId={projectId}
          rule={dialog.rule}
          ctx={ctx}
          open
          onOpenChange={(o) => !o && setDialog(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this rule?"
        description={confirm ? `“${confirm.name}” will stop running. Changes it already made stay as they are.` : undefined}
        pending={del.isPending}
        onConfirm={() => {
          if (confirm) del.mutate(confirm.id, { onSettled: () => setConfirm(null) });
        }}
      />
    </ManagerCard>
  );
}

function findSection(sections: Section[], name: string) {
  const needle = name.trim().toLowerCase();
  return sections.find((s) => s.name.trim().toLowerCase() === needle);
}

function buildTemplates(sections: Section[], meId: string, meName: string): Template[] {
  const done = findSection(sections, "Done");
  const inProgress = findSection(sections, "In progress");
  const first = meName.trim().split(/\s+/)[0] || "me";
  return [
    {
      id: "done-complete",
      label: "When moved to Done → mark complete",
      reason: "Needs a section named “Done”",
      build: () =>
        done
          ? {
              name: "When moved to Done → mark complete",
              trigger_type: "section_changed",
              trigger_config: { section_id: done.id },
              actions: [{ type: "set_complete", value: true }],
            }
          : null,
    },
    {
      id: "complete-done",
      label: "When completed → move to Done",
      reason: "Needs a section named “Done”",
      build: () =>
        done
          ? {
              name: "When completed → move to Done",
              trigger_type: "completed",
              trigger_config: {},
              actions: [{ type: "move_to_section", section_id: done.id }],
            }
          : null,
    },
    {
      id: "added-assign-me",
      label: `When added to project → assign to ${first}`,
      reason: "",
      build: () => ({
        name: `When added to project → assign to ${first}`,
        trigger_type: "task_added",
        trigger_config: {},
        actions: [{ type: "set_assignee", user_id: meId }],
      }),
    },
    {
      id: "progress-due",
      label: "When moved to In progress → set due in 7 days",
      reason: "Needs a section named “In progress”",
      build: () =>
        inProgress
          ? {
              name: "When moved to In progress → set due in 7 days",
              trigger_type: "section_changed",
              trigger_config: { section_id: inProgress.id },
              actions: [{ type: "set_due_in_days", days: 7 }],
            }
          : null,
    },
  ];
}
