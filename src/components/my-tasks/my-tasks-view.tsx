"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Calendar, CheckCircle2, Columns3, Filter, List } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useProjects } from "@/lib/queries/projects";
import { useMyTasks } from "@/lib/queries/tasks";
import { useRealtime } from "@/lib/queries/realtime";
import { useTaskNames } from "@/lib/queries/search";
import { qk } from "@/lib/queries/keys";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState, PageLoader } from "@/components/ui/misc";
import { Menu, MenuCheckItem, MenuContent, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { filterTasks, groupByBucket, type CompletionFilter, type SortMode } from "./buckets";
import { MyTasksList, type TaskListContext } from "./my-tasks-list";
import { MyTasksBoard } from "./my-tasks-board";
import { MyTasksCalendar } from "./my-tasks-calendar";

type Tab = "list" | "board" | "calendar";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "list", label: "List", icon: <List size={14} /> },
  { id: "board", label: "Board", icon: <Columns3 size={14} /> },
  { id: "calendar", label: "Calendar", icon: <Calendar size={14} /> },
];

const FILTER_LABEL: Record<CompletionFilter, string> = {
  incomplete: "Incomplete tasks",
  completed: "Completed tasks",
  all: "All tasks",
};

export function MyTasksView() {
  const me = useMe();
  const { data: tasks, isLoading } = useMyTasks(me.id);
  const { data: projects = [] } = useProjects();
  useRealtime({ table: "tasks", filter: `assignee_id=eq.${me.id}`, invalidate: [qk.myTasks(me.id)] });

  const [tab, setTab] = useState<Tab>("list");
  const [filter, setFilter] = useState<CompletionFilter>("incomplete");
  const [sort, setSort] = useState<SortMode>("manual");

  const parentIds = (tasks ?? []).map((t) => t.parent_id).filter(Boolean) as string[];
  const { data: parentNames } = useTaskNames(parentIds);

  const ctx: TaskListContext = useMemo(
    () => ({ projects: new Map(projects.map((p) => [p.id, p])), parentNames: parentNames ?? new Map() }),
    [projects, parentNames],
  );
  const visible = useMemo(() => filterTasks(tasks ?? [], filter), [tasks, filter]);
  const groups = useMemo(() => groupByBucket(visible, sort), [visible, sort]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-surface px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Avatar profile={me} size="lg" />
          <h1 className="text-xl font-semibold tracking-tight">My tasks</h1>
        </div>
        <nav className="mt-3 flex gap-1 overflow-x-auto" aria-label="My tasks views">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-[13.5px] whitespace-nowrap",
                tab === t.id ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text",
              )}
              aria-current={tab === t.id ? "page" : undefined}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <span className="text-[13px] text-muted">
          {visible.length} {visible.length === 1 ? "task" : "tasks"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <CheckCircle2 size={14} />
                <span className="hidden sm:inline">{FILTER_LABEL[filter]}</span>
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuLabel>Show</MenuLabel>
              {(Object.keys(FILTER_LABEL) as CompletionFilter[]).map((f) => (
                <MenuCheckItem key={f} checked={filter === f} onSelect={() => setFilter(f)}>
                  {FILTER_LABEL[f]}
                </MenuCheckItem>
              ))}
            </MenuContent>
          </Menu>
          {tab !== "calendar" && (
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <ArrowUpDown size={14} />
                  <span className="hidden sm:inline">{sort === "due" ? "Sort: Due date" : "Sort"}</span>
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuLabel>Sort by</MenuLabel>
                <MenuCheckItem checked={sort === "manual"} onSelect={() => setSort("manual")}>
                  None (drag to order)
                </MenuCheckItem>
                <MenuCheckItem checked={sort === "due"} onSelect={() => setSort("due")}>
                  Due date
                </MenuCheckItem>
              </MenuContent>
            </Menu>
          )}
          {filter !== "incomplete" && (
            <Button variant="ghost" size="sm" onClick={() => setFilter("incomplete")} aria-label="Reset filter">
              <Filter size={14} /> Reset
            </Button>
          )}
        </div>
      </div>

      <div className={cn("min-h-0 flex-1", tab === "list" ? "overflow-auto scrollbar-thin" : "overflow-hidden")}>
        {isLoading ? (
          <PageLoader />
        ) : tab === "list" ? (
          <div className="px-0 sm:px-2">
            <MyTasksList groups={groups} sort={sort} ctx={ctx} showAdd={filter !== "completed"} />
            {!tasks?.length && (
              <EmptyState
                icon={<CheckCircle2 size={28} />}
                title="You're all caught up"
                description="Tasks assigned to you show up here. Add a personal task above to get started."
              />
            )}
          </div>
        ) : tab === "board" ? (
          <MyTasksBoard groups={groups} sort={sort} ctx={ctx} />
        ) : (
          <MyTasksCalendar tasks={visible} ctx={ctx} />
        )}
      </div>
    </div>
  );
}
