import { fieldOptions, describeValue, isSelectField, normalizeValue } from "@/components/fields/field-meta";
import type { RuleInput, RuleTriggerConfig } from "@/lib/queries/rules";
import type { CustomField, Profile, RuleAction, RuleTrigger, Section } from "@/types/models";
import type { Json } from "@/types/database";

export interface RuleContext {
  sections: Section[];
  fields: CustomField[];
  people: Map<string, Profile>;
}

export const TRIGGERS: { type: RuleTrigger; label: string }[] = [
  { type: "task_added", label: "Task is added to this project" },
  { type: "section_changed", label: "Task is moved to a section" },
  { type: "completed", label: "Task is marked complete" },
  { type: "assignee_changed", label: "Task is assigned" },
  { type: "due_date_changed", label: "Due date changes" },
  { type: "field_changed", label: "A custom field changes" },
];

export const ACTIONS: { type: RuleAction["type"]; label: string }[] = [
  { type: "move_to_section", label: "Move to section" },
  { type: "set_complete", label: "Mark complete / incomplete" },
  { type: "set_assignee", label: "Set assignee" },
  { type: "set_due_in_days", label: "Set due date" },
  { type: "add_follower", label: "Add collaborator" },
  { type: "add_comment", label: "Add comment" },
  { type: "set_field", label: "Set custom field" },
];

export function defaultAction(type: RuleAction["type"], meId: string): RuleAction {
  switch (type) {
    case "move_to_section":
      return { type, section_id: "" };
    case "set_complete":
      return { type, value: true };
    case "set_assignee":
      return { type, user_id: meId };
    case "set_due_in_days":
      return { type, days: 7 };
    case "add_follower":
      return { type, user_id: "" };
    case "add_comment":
      return { type, body: "" };
    case "set_field":
      return { type, field_id: "", value: null };
  }
}

/** Keep only the trigger_config keys `run_rules` reads for this trigger. */
export function cleanTriggerConfig(type: RuleTrigger, c: RuleTriggerConfig): RuleTriggerConfig {
  switch (type) {
    case "task_added":
    case "section_changed":
      return c.section_id ? { section_id: c.section_id } : {};
    case "assignee_changed":
      return c.user_id ? { user_id: c.user_id } : {};
    case "field_changed":
      return { ...(c.field_id ? { field_id: c.field_id } : {}), ...(c.option_id ? { option_id: c.option_id } : {}) };
    default:
      return {};
  }
}

const q = (s: string) => `“${s}”`;
const personName = (ctx: RuleContext, id: string) => {
  const p = ctx.people.get(id);
  return p ? p.full_name || p.email : "(unknown person)";
};
const sectionName = (ctx: RuleContext, id: string | undefined) => {
  const s = ctx.sections.find((x) => x.id === id);
  return s ? q(s.name) : "(deleted section)";
};

function describeTrigger(type: RuleTrigger, c: RuleTriggerConfig, ctx: RuleContext): string {
  switch (type) {
    case "task_added":
      return c.section_id ? `a task is added to ${sectionName(ctx, c.section_id)}` : "a task is added to this project";
    case "section_changed":
      return c.section_id ? `a task is moved to ${sectionName(ctx, c.section_id)}` : "a task is moved to another section";
    case "completed":
      return "a task is marked complete";
    case "assignee_changed":
      return c.user_id ? `a task is assigned to ${personName(ctx, c.user_id)}` : "a task is assigned";
    case "due_date_changed":
      return "a task’s due date changes";
    case "field_changed": {
      const f = ctx.fields.find((x) => x.id === c.field_id);
      if (!f) return "(deleted field) changes";
      if (!c.option_id) return `${q(f.name)} changes`;
      const opt = fieldOptions(f).find((o) => o.id === c.option_id);
      const optName = opt ? q(opt.name) : "(removed option)";
      return f.type === "multi_select" ? `${q(f.name)} includes ${optName}` : `${q(f.name)} is set to ${optName}`;
    }
  }
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function describeAction(a: RuleAction, ctx: RuleContext): string {
  switch (a.type) {
    case "move_to_section":
      return a.section_id ? `move it to ${sectionName(ctx, a.section_id)}` : "move it to …";
    case "set_complete":
      return a.value === false ? "mark it incomplete" : "mark it complete";
    case "set_assignee":
      return a.user_id ? `assign it to ${personName(ctx, a.user_id)}` : "unassign it";
    case "set_due_in_days": {
      const d = Number(a.days) || 0;
      if (d === 0) return "set the due date to today";
      if (d === 1) return "set the due date to tomorrow";
      return d > 0 ? `set the due date ${plural(d, "day")} out` : `set the due date ${plural(-d, "day")} back`;
    }
    case "add_follower":
      return a.user_id ? `add ${personName(ctx, a.user_id)} as a collaborator` : "add a collaborator";
    case "add_comment": {
      const body = (a.body ?? "").trim();
      return body ? `comment ${q(body.length > 48 ? `${body.slice(0, 47)}…` : body)}` : "add a comment";
    }
    case "set_field": {
      const f = ctx.fields.find((x) => x.id === a.field_id);
      if (!f) return a.field_id ? "set (deleted field)" : "set a field";
      return `set ${q(f.name)} to ${describeValue(f, a.value as Json | null, ctx.people)}`;
    }
  }
}

function joinList(parts: string[]) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function describeRule(
  r: Pick<RuleInput, "trigger_type" | "trigger_config" | "actions">,
  ctx: RuleContext,
): string {
  const then = r.actions.length ? joinList(r.actions.map((a) => describeAction(a, ctx))) : "do nothing";
  return `When ${describeTrigger(r.trigger_type, r.trigger_config, ctx)}, ${then}`;
}

/** Problems that would make the rule silently do nothing (or something unintended). Empty = valid. */
export function validateRule(r: RuleInput, ctx: RuleContext, opts: { requireName?: boolean } = {}): string[] {
  const errors: string[] = [];
  const hasSection = (id: string | undefined) => !!id && ctx.sections.some((s) => s.id === id);
  if (opts.requireName && !r.name.trim()) errors.push("Give the rule a name.");
  if (!TRIGGERS.some((t) => t.type === r.trigger_type)) errors.push("Choose a trigger.");

  const c = r.trigger_config;
  if ((r.trigger_type === "task_added" || r.trigger_type === "section_changed") && c.section_id && !hasSection(c.section_id)) {
    errors.push("The trigger’s section no longer exists.");
  }
  if (r.trigger_type === "assignee_changed" && c.user_id && !ctx.people.has(c.user_id)) {
    errors.push("The trigger’s person no longer exists.");
  }
  if (r.trigger_type === "field_changed") {
    const f = ctx.fields.find((x) => x.id === c.field_id);
    if (!c.field_id) errors.push("Choose which field to watch.");
    else if (!f) errors.push("The watched field was deleted.");
    else if (!isSelectField(f)) errors.push("Only single- and multi-select fields can trigger rules.");
    else if (c.option_id && !fieldOptions(f).some((o) => o.id === c.option_id)) {
      errors.push("The watched option was removed from the field.");
    }
  }

  if (r.actions.length === 0) errors.push("Add at least one action.");
  r.actions.forEach((a, i) => {
    const n = r.actions.length > 1 ? `Action ${i + 1}: ` : "";
    switch (a.type) {
      case "move_to_section":
        if (!a.section_id) errors.push(`${n}choose a section.`);
        else if (!hasSection(a.section_id)) errors.push(`${n}the section no longer exists.`);
        if (r.trigger_type === "section_changed" && c.section_id && c.section_id === a.section_id) {
          errors.push(`${n}the task is already in that section when this rule runs.`);
        }
        break;
      case "set_assignee":
        if (a.user_id && !ctx.people.has(a.user_id)) errors.push(`${n}the person no longer exists.`);
        break;
      case "set_due_in_days":
        if (!Number.isInteger(a.days) || Math.abs(a.days) > 3650) errors.push(`${n}enter a whole number of days.`);
        break;
      case "add_follower":
        if (!a.user_id) errors.push(`${n}choose a person.`);
        else if (!ctx.people.has(a.user_id)) errors.push(`${n}the person no longer exists.`);
        break;
      case "add_comment":
        if (!a.body?.trim()) errors.push(`${n}write the comment.`);
        else if (a.body.length > 2000) errors.push(`${n}keep the comment under 2,000 characters.`);
        break;
      case "set_field": {
        const f = ctx.fields.find((x) => x.id === a.field_id);
        if (!a.field_id) errors.push(`${n}choose a field.`);
        else if (!f) errors.push(`${n}the field was deleted.`);
        else if (normalizeValue(a.value as Json | null) === null) errors.push(`${n}choose a value for ${q(f.name)}.`);
        break;
      }
    }
  });
  if (r.trigger_type === "completed" && r.actions.some((a) => a.type === "set_complete" && a.value === false)) {
    errors.push("Marking a task incomplete right after it’s completed would undo the completion.");
  }
  return errors;
}
