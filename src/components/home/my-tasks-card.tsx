"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useProjects } from "@/lib/queries/projects";
import type { TaskItem } from "@/lib/queries/tasks";
import { useTaskPane } from "@/lib/task-pane";
import { TaskCheckbox, DueDateButton } from "@/components/task/task-bits";
import { EmptyState, Spinner } from "@/components/ui/misc";
import { ProjectChip } from "@/components/my-tasks/task-meta";
import { cn, toISODate } from "@/lib/utils";
import { HomeCard } from "./card";

type Tab = "upcoming" | "overdue" | "completed";
const LIMIT = 8;

export function HomeMyTasksCard({ tasks, loading }: { tasks: TaskItem[]; loading: boolean }) {
  const { openTask } = useTaskPane();
  const { data: projects = [] } = useProjects();
  const [tab, setTab] = useState<Tab>("upcoming");
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const lists = useMemo(() => {
    const today = toISODate(new Date())!;
    const open = tasks.filter((t) => !t.completed);
    const byDue = (a: TaskItem, b: TaskItem) =>
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || b.created_at.localeCompare(a.created_at);
    return {
      upcoming: open.filter((t) => !t.due_date || t.due_date >= today).sort(byDue),
      overdue: open.filter((t) => t.due_date && t.due_date < today).sort(byDue),
      completed: tasks
        .filter((t) => t.completed)
        .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")),
    };
  }, [tasks]);

  const list = lists[tab];
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "upcoming", label: "Upcoming" },
    { id: "overdue", label: "Overdue", count: lists.overdue.length },
    { id: "completed", label: "Completed" },
  ];

  return (
    <HomeCard
      title={
        <Link href="/my-tasks" className="hover:underline">
          My tasks
        </Link>
      }
      action={
        <Link href="/my-tasks" className="text-[13px] text-muted hover:text-text">
          View all
        </Link>
      }
    >
      <div className="mb-1 flex gap-1 border-b border-border" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px flex h-8 items-center gap-1 border-b-2 px-2 text-[13px]",
              tab === t.id ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
            {!!t.count && (
              <span className={cn("rounded-full px-1.5 text-[11px]", t.id === "overdue" ? "bg-danger-soft text-danger" : "bg-surface-2")}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : !list.length ? (
        <EmptyState
          className="py-10"
          icon={<CheckCircle2 size={24} />}
          title={tab === "overdue" ? "Nothing overdue" : tab === "completed" ? "No completed tasks yet" : "No upcoming tasks"}
          description={tab === "upcoming" ? "Tasks assigned to you will show up here." : undefined}
        />
      ) : (
        <ul>
          {list.slice(0, LIMIT).map((t) => (
            <li
              key={t.id}
              onClick={() => openTask(t.id)}
              className="group flex h-10 cursor-pointer items-center gap-2 border-b border-border px-1 text-[13.5px] last:border-b-0 hover:bg-surface-2/60"
            >
              <TaskCheckbox task={t} />
              <span className={cn("min-w-0 flex-1 truncate", t.completed && "text-faint line-through")}>
                {t.name || <span className="text-faint">Untitled task</span>}
              </span>
              <ProjectChip project={t.project_id ? projectMap.get(t.project_id) : undefined} className="hidden max-w-32 sm:inline-flex" />
              <DueDateButton task={t} placeholder={false} />
            </li>
          ))}
          {list.length > LIMIT && (
            <li className="pt-2 text-center">
              <Link href="/my-tasks" className="text-[13px] text-muted hover:text-text">
                {list.length - LIMIT} more…
              </Link>
            </li>
          )}
        </ul>
      )}
    </HomeCard>
  );
}
