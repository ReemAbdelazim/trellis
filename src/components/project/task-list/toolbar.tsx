"use client";

import { ArrowUpDown, Filter, Plus, Search, X } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useProfileMap } from "@/lib/queries/people";
import { useTagMap } from "@/lib/queries/tags";
import { Button } from "@/components/ui/button";
import { Menu, MenuCheckItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import type { Profile, Tag } from "@/types/models";
import {
  activeFilterCount,
  DEFAULT_VIEW_OPTIONS,
  NO_FILTERS,
  SORT_LABEL,
  type DueFilter,
  type SortKey,
  type StatusFilter,
  type ViewOptions,
} from "./view-options";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "incomplete", label: "Incomplete tasks" },
  { value: "completed", label: "Completed tasks" },
  { value: "all", label: "All tasks" },
];

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "week", label: "Due this week" },
  { value: "overdue", label: "Overdue" },
];

/** Shared toolbar for the list and board views: add, search, filter and sort. */
export function TaskViewToolbar({
  options,
  onOptionsChange,
  search,
  onSearchChange,
  onAddTask,
  assigneeIds,
  tagIds,
  children,
}: {
  options: ViewOptions;
  onOptionsChange: (patch: Partial<ViewOptions>) => void;
  search: string;
  onSearchChange: (v: string) => void;
  /** Omitted for read-only users. */
  onAddTask?: () => void;
  /** People who currently have tasks in the project (assignee filter choices). */
  assigneeIds: string[];
  /** Tags on the project's tasks (tag filter choices). */
  tagIds: string[];
  /** Extra right-aligned controls. */
  children?: React.ReactNode;
}) {
  const me = useMe();
  const people = useProfileMap();
  const tagMap = useTagMap();
  const filters = activeFilterCount(options);
  const tags = tagIds
    .map((id) => tagMap.get(id))
    .filter((t): t is Tag => !!t)
    .sort((a, b) => a.name.localeCompare(b.name));
  const others = assigneeIds
    .filter((id) => id !== me.id)
    .map((id) => people.get(id))
    .filter((p): p is Profile => !!p)
    .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));

  // Keep the menu open while toggling options.
  const pick = (patch: Partial<ViewOptions>) => (e: Event) => {
    e.preventDefault();
    onOptionsChange(patch);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2 sm:px-6">
      {onAddTask && (
        <Button variant="primary" size="sm" onClick={onAddTask}>
          <Plus size={15} /> Add task
        </Button>
      )}
      <div className="relative order-last w-full sm:order-none sm:w-56">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onSearchChange("")}
          placeholder="Search in project"
          aria-label="Search tasks in this project"
          className="h-7 w-full rounded-md border border-border bg-surface pr-7 pl-8 text-[13px] placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-[var(--ring)] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-faint hover:text-text"
          >
            <X size={13} />
          </button>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        {children}
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="sm" className={cn(filters > 0 && "bg-accent-soft text-accent hover:bg-accent-soft")}>
              <Filter size={14} />
              <span>Filter{filters > 0 ? `: ${filters}` : ""}</span>
            </Button>
          </MenuTrigger>
          <MenuContent align="end" className="max-h-[70vh] w-60 overflow-y-auto scrollbar-thin">
            <MenuLabel>Completion</MenuLabel>
            {STATUS_OPTIONS.map((o) => (
              <MenuCheckItem key={o.value} checked={options.status === o.value} onSelect={pick({ status: o.value })}>
                {o.label}
              </MenuCheckItem>
            ))}
            <MenuSeparator />
            <MenuLabel>Due date</MenuLabel>
            {DUE_OPTIONS.map((o) => (
              <MenuCheckItem key={o.value} checked={options.due === o.value} onSelect={pick({ due: o.value })}>
                {o.label}
              </MenuCheckItem>
            ))}
            <MenuSeparator />
            <MenuLabel>Assignee</MenuLabel>
            <MenuCheckItem checked={options.assignee === "any"} onSelect={pick({ assignee: "any" })}>
              Anyone
            </MenuCheckItem>
            <MenuCheckItem checked={options.assignee === "me"} onSelect={pick({ assignee: "me" })}>
              Just my tasks
            </MenuCheckItem>
            <MenuCheckItem checked={options.assignee === "unassigned"} onSelect={pick({ assignee: "unassigned" })}>
              Unassigned
            </MenuCheckItem>
            {others.map((p) => (
              <MenuCheckItem key={p.id} checked={options.assignee === p.id} onSelect={pick({ assignee: p.id })}>
                <span className="truncate">{p.full_name || p.email}</span>
              </MenuCheckItem>
            ))}
            {tags.length > 0 && (
              <>
                <MenuSeparator />
                <MenuLabel>Tag</MenuLabel>
                <MenuCheckItem checked={options.tag === "any"} onSelect={pick({ tag: "any" })}>
                  Any tag
                </MenuCheckItem>
                {tags.map((t) => (
                  <MenuCheckItem key={t.id} checked={options.tag === t.id} onSelect={pick({ tag: t.id })}>
                    <span className="truncate">{t.name}</span>
                  </MenuCheckItem>
                ))}
              </>
            )}
            {filters > 0 && (
              <>
                <MenuSeparator />
                <MenuItem
                  icon={<X size={14} />}
                  onSelect={() => onOptionsChange({ status: DEFAULT_VIEW_OPTIONS.status, ...NO_FILTERS })}
                >
                  Clear filters
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
        <Menu>
          <MenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(options.sort !== "manual" && "bg-accent-soft text-accent hover:bg-accent-soft")}
            >
              <ArrowUpDown size={14} />
              <span>{options.sort === "manual" ? "Sort" : `Sort: ${SORT_LABEL[options.sort]}`}</span>
            </Button>
          </MenuTrigger>
          <MenuContent align="end" className="w-52">
            <MenuLabel>Sort by</MenuLabel>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <MenuCheckItem key={key} checked={options.sort === key} onSelect={() => onOptionsChange({ sort: key })}>
                {SORT_LABEL[key]}
              </MenuCheckItem>
            ))}
          </MenuContent>
        </Menu>
      </div>
    </div>
  );
}
