"use client";

import { useCallback, useMemo } from "react";
import { differenceInCalendarDays, endOfWeek, startOfWeek } from "date-fns";
import { toDate } from "@/lib/utils";
import { useLocalString } from "@/lib/use-local-storage";
import type { TaskItem } from "@/lib/queries/tasks";
import type { Profile, Section } from "@/types/models";

// ---------------------------------------------------------------------------
// Toolbar choices shared by the list and board views, persisted per project.
// ---------------------------------------------------------------------------

export type StatusFilter = "incomplete" | "completed" | "all";
/** "any" | "me" | "unassigned" | a user id */
export type AssigneeFilter = string;
export type DueFilter = "any" | "week" | "overdue";
export type SortKey = "manual" | "due" | "assignee" | "name" | "created";

export interface ViewOptions {
  status: StatusFilter;
  assignee: AssigneeFilter;
  due: DueFilter;
  sort: SortKey;
}

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  status: "incomplete",
  assignee: "any",
  due: "any",
  sort: "manual",
};

export const SORT_LABEL: Record<SortKey, string> = {
  manual: "Manual",
  due: "Due date",
  assignee: "Assignee",
  name: "Alphabetical",
  created: "Creation date",
};

const storageKey = (projectId: string) => `trellis:view-options:${projectId}`;

function parse(raw: string | null): ViewOptions {
  if (!raw) return DEFAULT_VIEW_OPTIONS;
  try {
    const v = JSON.parse(raw) as Partial<ViewOptions>;
    return {
      status: v.status === "completed" || v.status === "all" ? v.status : "incomplete",
      assignee: typeof v.assignee === "string" && v.assignee ? v.assignee : "any",
      due: v.due === "week" || v.due === "overdue" ? v.due : "any",
      sort: v.sort && v.sort in SORT_LABEL ? v.sort : "manual",
    };
  } catch {
    return DEFAULT_VIEW_OPTIONS;
  }
}

/** Filter/sort choices for a project, stored in localStorage (SSR snapshot = defaults). */
export function useViewOptions(projectId: string) {
  const [raw, save, read] = useLocalString(storageKey(projectId));
  const options = useMemo(() => parse(raw), [raw]);
  // Merge onto the latest stored value so quick successive changes all stick.
  const setOptions = useCallback((patch: Partial<ViewOptions>) => save(JSON.stringify({ ...parse(read()), ...patch })), [save, read]);
  return [options, setOptions] as const;
}

export function activeFilterCount(o: ViewOptions) {
  return (o.status !== "incomplete" ? 1 : 0) + (o.assignee !== "any" ? 1 : 0) + (o.due !== "any" ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Filtering, sorting and grouping
// ---------------------------------------------------------------------------

function matches(t: TaskItem, o: ViewOptions, meId: string, needle: string) {
  if (o.status === "incomplete" && t.completed) return false;
  if (o.status === "completed" && !t.completed) return false;
  if (o.assignee === "me" && t.assignee_id !== meId) return false;
  if (o.assignee === "unassigned" && t.assignee_id) return false;
  if (o.assignee !== "any" && o.assignee !== "me" && o.assignee !== "unassigned" && t.assignee_id !== o.assignee) {
    return false;
  }
  if (o.due !== "any") {
    const d = toDate(t.due_date);
    if (!d) return false;
    if (o.due === "overdue" && (t.completed || differenceInCalendarDays(d, new Date()) >= 0)) return false;
    if (o.due === "week") {
      const now = new Date();
      if (d < startOfWeek(now) || d > endOfWeek(now)) return false;
    }
  }
  if (needle && !t.name.toLowerCase().includes(needle)) return false;
  return true;
}

function comparator(sort: SortKey, people: Map<string, Profile>) {
  const byPosition = (a: TaskItem, b: TaskItem) => a.position - b.position;
  switch (sort) {
    case "due":
      return (a: TaskItem, b: TaskItem) =>
        a.due_date === b.due_date
          ? byPosition(a, b)
          : !a.due_date
            ? 1
            : !b.due_date
              ? -1
              : a.due_date.localeCompare(b.due_date);
    case "assignee": {
      const name = (t: TaskItem) => {
        const p = t.assignee_id ? people.get(t.assignee_id) : undefined;
        return p ? (p.full_name || p.email).toLowerCase() : null;
      };
      return (a: TaskItem, b: TaskItem) => {
        const na = name(a);
        const nb = name(b);
        if (na === nb) return byPosition(a, b);
        if (na === null) return 1;
        if (nb === null) return -1;
        return na.localeCompare(nb);
      };
    }
    case "name":
      return (a: TaskItem, b: TaskItem) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) || byPosition(a, b);
    case "created":
      return (a: TaskItem, b: TaskItem) => a.created_at.localeCompare(b.created_at) || byPosition(a, b);
    default:
      return byPosition;
  }
}

/**
 * Visible tasks grouped by section id, in display order. Tasks whose section is
 * missing (null / deleted) are shown in the first section, which is also where
 * the database trigger puts them.
 */
export function groupTasks(
  tasks: TaskItem[],
  sections: Section[],
  options: ViewOptions,
  search: string,
  meId: string,
  people: Map<string, Profile>,
): Record<string, TaskItem[]> {
  const groups: Record<string, TaskItem[]> = {};
  for (const s of sections) groups[s.id] = [];
  const fallback = sections[0]?.id;
  const needle = search.trim().toLowerCase();
  for (const t of tasks) {
    if (!matches(t, options, meId, needle)) continue;
    const key = t.section_id && groups[t.section_id] ? t.section_id : fallback;
    if (key) groups[key].push(t);
  }
  const cmp = comparator(options.sort, people);
  for (const key of Object.keys(groups)) groups[key].sort(cmp);
  return groups;
}

/** All tasks (ignoring filters) per section, for computing append positions and counts. */
export function tasksBySection(tasks: TaskItem[], sections: Section[]) {
  const map = new Map<string, TaskItem[]>();
  for (const s of sections) map.set(s.id, []);
  const fallback = sections[0]?.id;
  for (const t of tasks) {
    const key = t.section_id && map.has(t.section_id) ? t.section_id : fallback;
    if (key) map.get(key)!.push(t);
  }
  return map;
}
