"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, FolderOpen, Search, Users, X } from "lucide-react";
import { useProjects, useProjectStats } from "@/lib/queries/projects";
import { useActiveProfiles, useProfileMap } from "@/lib/queries/people";
import { useDebounced, useTaskSearch } from "@/lib/queries/search";
import { useTaskPane } from "@/lib/task-pane";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, PageLoader, ProgressBar, Spinner, StatusPill } from "@/components/ui/misc";
import { ProjectChip } from "@/components/my-tasks/task-meta";
import { cn, colorHex, DUE_TONE_CLASS, dueTone, formatDue } from "@/lib/utils";
import { routes } from "@/lib/routes";

type Tab = "tasks" | "projects" | "people";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuid = (v: string | null) => (v && UUID_RE.test(v) ? v : null);

export function SearchResults() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlQ = params.get("q") ?? "";
  const tab = (["tasks", "projects", "people"].includes(params.get("tab") ?? "") ? params.get("tab") : "tasks") as Tab;
  const assigneeId = asUuid(params.get("assignee"));
  const projectId = asUuid(params.get("project"));
  const includeCompleted = params.get("completed") === "1";

  // Local text box that follows the URL until the user types.
  const [draft, setDraft] = useState(urlQ);
  const [syncedQ, setSyncedQ] = useState(urlQ);
  if (syncedQ !== urlQ) {
    setSyncedQ(urlQ);
    setDraft(urlQ);
  }
  const q = useDebounced(draft.trim(), 250);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const commitQuery = (value: string) => {
    if (value.trim() !== urlQ) setParams({ q: value.trim() || null });
  };

  const { data: projects = [] } = useProjects();
  const { data: people, isLoading: peopleLoading } = useActiveProfiles();
  const profiles = useProfileMap();
  const tasks = useTaskSearch({ q, includeCompleted, assigneeId, projectId });

  const lower = q.toLowerCase();
  const projectHits = useMemo(
    () =>
      projects.filter(
        (p) => !p.is_template && (!lower || p.name.toLowerCase().includes(lower) || p.description?.toLowerCase().includes(lower)),
      ),
    [projects, lower],
  );
  const peopleHits = useMemo(
    () =>
      people.filter(
        (p) =>
          !lower ||
          p.full_name.toLowerCase().includes(lower) ||
          p.email.toLowerCase().includes(lower) ||
          (p.title ?? "").toLowerCase().includes(lower),
      ),
    [people, lower],
  );

  const assignee = assigneeId ? profiles.get(assigneeId) : undefined;
  const taskCount = tasks.data?.length ?? 0;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "tasks", label: "Tasks", count: tasks.data ? taskCount : undefined },
    { id: "projects", label: "Projects", count: projectHits.length },
    { id: "people", label: "People", count: peopleHits.length },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-border bg-surface px-4 pt-4 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commitQuery(draft);
          }}
          className="relative max-w-2xl"
        >
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitQuery(draft)}
            placeholder="Search tasks, projects and people"
            className="h-10 pl-9 text-[15px]"
            aria-label="Search"
          />
        </form>
        <nav className="mt-3 flex gap-1 overflow-x-auto" aria-label="Result types">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setParams({ tab: t.id === "tasks" ? null : t.id })}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-[13.5px] whitespace-nowrap",
                tab === t.id ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text",
              )}
            >
              {t.label}
              {t.count !== undefined && <span className="text-xs text-faint">{t.count}</span>}
            </button>
          ))}
        </nav>
      </header>

      {tab === "tasks" && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
          <Select
            value={assigneeId ?? ""}
            onChange={(e) => setParams({ assignee: e.target.value || null })}
            className="h-8 w-auto max-w-44 text-[13px]"
            aria-label="Assignee"
          >
            <option value="">Any assignee</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </Select>
          <Select
            value={projectId ?? ""}
            onChange={(e) => setParams({ project: e.target.value || null })}
            className="h-8 w-auto max-w-44 text-[13px]"
            aria-label="Project"
          >
            <option value="">Any project</option>
            {projects
              .filter((p) => !p.is_template)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted select-none">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(e) => setParams({ completed: e.target.checked ? "1" : null })}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Include completed
          </label>
          {(assigneeId || projectId) && (
            <Button variant="ghost" size="sm" onClick={() => setParams({ assignee: null, project: null })}>
              <X size={13} /> Clear filters
            </Button>
          )}
          {tasks.isFetching && <Spinner size={14} />}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {tab === "tasks" ? (
          <TaskResults
            loading={tasks.isLoading}
            error={tasks.error}
            hits={tasks.data}
            active={!!(q || assigneeId || projectId)}
            heading={assignee ? `Tasks assigned to ${assignee.full_name || assignee.email}` : null}
            profiles={profiles}
          />
        ) : tab === "projects" ? (
          <ProjectResults hits={projectHits} />
        ) : peopleLoading ? (
          <PageLoader />
        ) : !peopleHits.length ? (
          <EmptyState icon={<Users size={28} />} title="No people found" />
        ) : (
          <ul className="grid gap-2 p-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            {peopleHits.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/search?assignee=${p.id}`}
                  className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3 hover:border-border-strong hover:bg-surface-2/50"
                >
                  <Avatar profile={p} size="lg" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium">{p.full_name || p.email}</span>
                    <span className="block truncate text-xs text-faint">{p.title || p.email}</span>
                    <span className="block text-[11px] text-muted capitalize">{p.role}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TaskResults({
  loading,
  error,
  hits,
  active,
  heading,
  profiles,
}: {
  loading: boolean;
  error: unknown;
  hits: ReturnType<typeof useTaskSearch>["data"];
  active: boolean;
  heading: string | null;
  profiles: ReturnType<typeof useProfileMap>;
}) {
  const { openTask, taskId } = useTaskPane();
  if (!active) {
    return (
      <EmptyState
        icon={<Search size={28} />}
        title="Search your workspace"
        description="Type a few words to find tasks by name or description. Use quotes for exact phrases and -word to exclude."
      />
    );
  }
  if (loading) return <PageLoader />;
  if (error) return <EmptyState title="Search failed" description="Try different words." />;
  if (!hits?.length) return <EmptyState icon={<CheckCircle2 size={28} />} title="No matching tasks" />;
  return (
    <div className="pb-6">
      {heading && <h2 className="px-4 pt-3 pb-1 text-[14px] font-semibold sm:px-6">{heading}</h2>}
      <ul className="border-t border-border">
        {hits.map((t) => {
          const assignee = t.assignee_id ? profiles.get(t.assignee_id) : undefined;
          return (
            <li
              key={t.id}
              onClick={() => openTask(t.id)}
              className={cn(
                "flex h-11 cursor-pointer items-center gap-2.5 border-b border-border px-4 text-[13.5px] hover:bg-surface-2/60 sm:px-6",
                taskId === t.id && "bg-accent-soft/50",
              )}
            >
              <CheckCircle2 size={16} className={cn("shrink-0", t.completed ? "text-success" : "text-faint")} />
              <span className={cn("min-w-0 flex-1 truncate", t.completed && "text-muted line-through")}>
                {t.name || "Untitled task"}
              </span>
              <ProjectChip project={t.project} className="hidden max-w-48 sm:inline-flex" />
              {t.due_date && (
                <span className={cn("shrink-0 text-xs", DUE_TONE_CLASS[dueTone(t.due_date, t.completed)])}>
                  {formatDue(t.due_date)}
                </span>
              )}
              <Avatar profile={assignee} size="xs" tooltip />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProjectResults({ hits }: { hits: ReturnType<typeof useProjects>["data"] & object }) {
  const { data: stats } = useProjectStats();
  if (!hits.length) return <EmptyState icon={<FolderOpen size={28} />} title="No projects found" />;
  return (
    <ul className="grid gap-2 p-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
      {hits.map((p) => {
        const s = stats?.get(p.id);
        const total = s?.total_tasks ?? 0;
        const pct = total ? Math.round(((s?.completed_tasks ?? 0) / total) * 100) : 0;
        return (
          <li key={p.id}>
            <Link
              href={routes.project(p.id)}
              className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3 hover:border-border-strong hover:bg-surface-2/50"
            >
              <span className="h-9 w-9 shrink-0 rounded-lg" style={{ background: colorHex(p.color) }} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-medium">{p.name}</span>
                  {p.archived && <span className="text-[11px] text-faint">Archived</span>}
                </span>
                <ProgressBar value={pct} className="mt-1.5" />
                <span className="mt-1 flex items-center gap-2 text-[11.5px] text-faint">
                  {total ? `${pct}% complete` : "No tasks"}
                  {p.current_status && <StatusPill status={p.current_status} />}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
