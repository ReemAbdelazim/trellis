"use client";

import { useState } from "react";
import { Plus, Trash2, X, Zap } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/avatar";
import { UserPicker } from "@/components/ui/user-picker";
import { FieldValueEditor } from "@/components/fields/field-value-editor";
import { fieldOptions, isSelectField } from "@/components/fields/field-meta";
import { useMe } from "@/lib/queries/me";
import {
  ruleActions,
  ruleTriggerConfig,
  useCreateRule,
  useUpdateRule,
  type RuleInput,
  type RuleTriggerConfig,
} from "@/lib/queries/rules";
import { cn } from "@/lib/utils";
import type { Json } from "@/types/database";
import type { Rule, RuleAction, RuleTrigger } from "@/types/models";
import {
  ACTIONS,
  cleanTriggerConfig,
  defaultAction,
  describeRule,
  TRIGGERS,
  validateRule,
  type RuleContext,
} from "./rule-logic";

type DraftAction = RuleAction & { key: string };

/** Create (rule = null) or edit a rule. Mount with a `key` so state resets per rule. */
export function RuleDialog({
  projectId,
  rule,
  ctx,
  open,
  onOpenChange,
}: {
  projectId: string;
  rule: Rule | null;
  ctx: RuleContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const me = useMe();
  const create = useCreateRule(projectId);
  const update = useUpdateRule(projectId);

  const [name, setName] = useState(rule?.name ?? "");
  const [trigger, setTrigger] = useState<RuleTrigger>((rule?.trigger_type as RuleTrigger) ?? "section_changed");
  const [config, setConfig] = useState<RuleTriggerConfig>(() => (rule ? ruleTriggerConfig(rule) : {}));
  const [actions, setActions] = useState<DraftAction[]>(() =>
    rule
      ? ruleActions(rule).map((a) => ({ ...a, key: crypto.randomUUID() }))
      : [{ ...defaultAction("set_complete", me.id), key: crypto.randomUUID() }],
  );
  const [submitted, setSubmitted] = useState(false);

  const input: RuleInput = {
    name: name.trim(),
    trigger_type: trigger,
    trigger_config: cleanTriggerConfig(trigger, config),
    actions: actions.map(({ key: _key, ...a }) => {
      void _key;
      return a as RuleAction;
    }),
  };
  const summary = describeRule(input, ctx);
  const errors = validateRule(input, ctx);
  const pending = create.isPending || update.isPending;

  const save = () => {
    setSubmitted(true);
    if (errors.length) return;
    const payload = { ...input, name: input.name || summary.slice(0, 120) };
    if (rule) update.mutate({ id: rule.id, ...payload }, { onSuccess: () => onOpenChange(false) });
    else create.mutate({ ...payload, enabled: true }, { onSuccess: () => onOpenChange(false) });
  };

  const patchAction = (key: string, patch: Partial<RuleAction>) =>
    setActions((list) => list.map((a) => (a.key === key ? ({ ...a, ...patch } as DraftAction) : a)));

  const selectFields = ctx.fields.filter(isSelectField);
  const watchedField = ctx.fields.find((f) => f.id === config.field_id);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={rule ? "Edit rule" : "New rule"}
      description="Rules run automatically for every top-level task in this project."
      className="max-w-xl"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={pending}>
            {pending && <Spinner size={14} className="text-current" />}
            {rule ? "Save rule" : "Create rule"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <Label htmlFor="rule-name">Name</Label>
          <Input
            id="rule-name"
            value={name}
            maxLength={120}
            placeholder={summary}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-faint">Leave blank to use the summary below.</p>
        </div>

        {/* WHEN */}
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">When</legend>
          <Select
            aria-label="Trigger"
            value={trigger}
            onChange={(e) => {
              setTrigger(e.target.value as RuleTrigger);
              setConfig({});
            }}
          >
            {TRIGGERS.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </Select>

          {(trigger === "task_added" || trigger === "section_changed") && (
            <div className="mt-3">
              <Label htmlFor="rule-trigger-section">{trigger === "task_added" ? "Added to section" : "Moved to section"}</Label>
              <Select
                id="rule-trigger-section"
                value={config.section_id ?? ""}
                onChange={(e) => setConfig({ section_id: e.target.value || undefined })}
              >
                <option value="">Any section</option>
                {ctx.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {trigger === "assignee_changed" && (
            <div className="mt-3">
              <Label>Assigned to</Label>
              <div className="flex items-center gap-2">
                <PersonButton
                  userId={config.user_id ?? null}
                  ctx={ctx}
                  emptyLabel="Anyone"
                  onChange={(id) => setConfig({ user_id: id ?? undefined })}
                />
                {config.user_id && (
                  <Button size="icon-sm" variant="ghost" aria-label="Match anyone" onClick={() => setConfig({})}>
                    <X size={13} />
                  </Button>
                )}
              </div>
            </div>
          )}

          {trigger === "field_changed" && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="rule-trigger-field">Field</Label>
                <Select
                  id="rule-trigger-field"
                  value={config.field_id ?? ""}
                  onChange={(e) => setConfig({ field_id: e.target.value || undefined })}
                >
                  <option value="">Choose a field…</option>
                  {selectFields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
                {selectFields.length === 0 && (
                  <p className="mt-1 text-[11px] text-faint">Add a single- or multi-select field first.</p>
                )}
              </div>
              <div>
                <Label htmlFor="rule-trigger-option">
                  {watchedField?.type === "multi_select" ? "Includes option" : "Set to option"}
                </Label>
                <Select
                  id="rule-trigger-option"
                  value={config.option_id ?? ""}
                  disabled={!watchedField}
                  onChange={(e) => setConfig({ ...config, option_id: e.target.value || undefined })}
                >
                  <option value="">Any change</option>
                  {watchedField &&
                    fieldOptions(watchedField).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </Select>
              </div>
            </div>
          )}
        </fieldset>

        {/* THEN */}
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">Then</legend>
          <ol className="space-y-3">
            {actions.map((a, i) => (
              <li key={a.key} className="rounded-md bg-surface-2 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-xs font-semibold text-faint">{i + 1}</span>
                  <Select
                    aria-label={`Action ${i + 1}`}
                    value={a.type}
                    className="h-8"
                    onChange={(e) =>
                      setActions((list) =>
                        list.map((x) =>
                          x.key === a.key
                            ? { ...defaultAction(e.target.value as RuleAction["type"], me.id), key: a.key }
                            : x,
                        ),
                      )
                    }
                  >
                    {ACTIONS.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove action ${i + 1}`}
                    disabled={actions.length === 1}
                    onClick={() => setActions((list) => list.filter((x) => x.key !== a.key))}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
                <div className="mt-2 pl-7">
                  <ActionConfig action={a} ctx={ctx} onPatch={(p) => patchAction(a.key, p)} />
                </div>
              </li>
            ))}
          </ol>
          <Button
            size="xs"
            variant="ghost"
            className="mt-2"
            disabled={actions.length >= 10}
            onClick={() => setActions((list) => [...list, { ...defaultAction("move_to_section", me.id), key: crypto.randomUUID() }])}
          >
            <Plus size={13} /> Add action
          </Button>
        </fieldset>

        <div className="flex gap-2 rounded-md bg-accent-soft px-3 py-2 text-[13px]">
          <Zap size={15} className="mt-0.5 shrink-0 text-accent" />
          <span>{summary}.</span>
        </div>

        {submitted && errors.length > 0 && (
          <ul className="space-y-0.5 text-[13px] text-danger" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function ActionConfig({
  action: a,
  ctx,
  onPatch,
}: {
  action: RuleAction;
  ctx: RuleContext;
  onPatch: (patch: Partial<RuleAction>) => void;
}) {
  switch (a.type) {
    case "move_to_section":
      return (
        <Select
          aria-label="Section"
          className="h-8"
          value={a.section_id}
          onChange={(e) => onPatch({ section_id: e.target.value })}
        >
          <option value="">Choose a section…</option>
          {ctx.sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      );
    case "set_complete":
      return (
        <div className="flex gap-1" role="radiogroup" aria-label="Completion">
          {[
            { v: true, label: "Complete" },
            { v: false, label: "Incomplete" },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={a.value === o.v}
              onClick={() => onPatch({ value: o.v })}
              className={cn(
                "h-7 rounded-md border px-3 text-[13px]",
                a.value === o.v ? "border-accent bg-accent-soft font-medium text-text" : "border-border bg-surface text-muted",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      );
    case "set_assignee":
      return (
        <PersonButton userId={a.user_id} ctx={ctx} emptyLabel="Unassign" allowClear onChange={(id) => onPatch({ user_id: id })} />
      );
    case "set_due_in_days":
      return (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted">Due</span>
          <Input
            type="number"
            aria-label="Days from the day the rule runs"
            className="h-8 w-20"
            step={1}
            min={-3650}
            max={3650}
            value={Number.isFinite(a.days) ? a.days : ""}
            onChange={(e) => onPatch({ days: e.target.value === "" ? NaN : Number(e.target.value) })}
          />
          <span className="text-muted">days after the rule runs (0 = same day)</span>
        </div>
      );
    case "add_follower":
      return (
        <PersonButton
          userId={a.user_id || null}
          ctx={ctx}
          emptyLabel="Choose a person"
          onChange={(id) => onPatch({ user_id: id ?? "" })}
        />
      );
    case "add_comment":
      return (
        <Textarea
          aria-label="Comment"
          rows={2}
          maxLength={2000}
          placeholder="e.g. Thanks! Please attach the signed form before moving on."
          value={a.body}
          onChange={(e) => onPatch({ body: e.target.value })}
        />
      );
    case "set_field": {
      const f = ctx.fields.find((x) => x.id === a.field_id);
      return (
        <div className="space-y-2">
          <Select
            aria-label="Field"
            className="h-8"
            value={a.field_id}
            onChange={(e) => {
              const next = ctx.fields.find((x) => x.id === e.target.value);
              onPatch({ field_id: e.target.value, value: next?.type === "checkbox" ? false : null });
            }}
          >
            <option value="">Choose a field…</option>
            {ctx.fields.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
          {ctx.fields.length === 0 && <p className="text-[11px] text-faint">This project has no custom fields yet.</p>}
          {f && (
            <div className="flex min-h-8 items-center rounded-md border border-border bg-surface px-2">
              <FieldValueEditor
                key={f.id}
                field={f}
                value={(a.value ?? null) as Json | null}
                onChange={(value) => onPatch({ value: value ?? (f.type === "checkbox" ? false : null) })}
              />
            </div>
          )}
        </div>
      );
    }
  }
}

function PersonButton({
  userId,
  ctx,
  emptyLabel,
  allowClear,
  onChange,
}: {
  userId: string | null;
  ctx: RuleContext;
  emptyLabel: string;
  allowClear?: boolean;
  onChange: (id: string | null) => void;
}) {
  const p = userId ? ctx.people.get(userId) : undefined;
  return (
    <UserPicker value={userId} onChange={onChange} allowClear={allowClear}>
      <button
        type="button"
        className="flex h-8 max-w-full min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-2 text-[13px] hover:bg-surface-2"
      >
        <Avatar profile={p ?? null} size="xs" />
        <span className={cn("truncate", !p && "text-muted")}>
          {p ? p.full_name || p.email : userId ? "(unknown person)" : emptyLabel}
        </span>
      </button>
    </UserPicker>
  );
}
