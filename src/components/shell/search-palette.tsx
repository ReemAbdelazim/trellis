"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as D } from "radix-ui";
import { Command } from "cmdk";
import { CheckCircle2, CornerDownLeft, Home, Inbox, LayoutGrid, Search, Target } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useFavorites, useProjects, useProjectStats } from "@/lib/queries/projects";
import { useActiveProfiles } from "@/lib/queries/people";
import { useDebounced, useGoalSearch, useTaskNameSearch } from "@/lib/queries/search";
import { useTaskPane } from "@/lib/task-pane";
import { Avatar } from "@/components/ui/avatar";
import { Kbd, Spinner, StatusPill } from "@/components/ui/misc";
import { cn, colorHex, DUE_TONE_CLASS, dueTone, formatDue } from "@/lib/utils";
import { routes } from "@/lib/routes";

/** Global Ctrl/Cmd+K command palette (mounted by the app shell). */
export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]" />
        <D.Content
          className="fixed top-[10vh] left-1/2 z-50 flex max-h-[75vh] w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-pop focus:outline-none"
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">Search</D.Title>
          {open && (
            <Suspense fallback={<div className="p-6 text-center"><Spinner /></div>}>
              <Palette onClose={() => onOpenChange(false)} />
            </Suspense>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

const itemClass =
  "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] outline-none data-[selected=true]:bg-surface-2";
const groupClass =
  "px-1.5 pb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase";

function Palette({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const isGuest = me.role === "guest";
  const router = useRouter();
  const { openTask } = useTaskPane();
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 200);

  const { data: projects = [] } = useProjects();
  const { data: favorites = [] } = useFavorites();
  const { data: stats } = useProjectStats();
  const { data: people } = useActiveProfiles();
  const tasks = useTaskNameSearch(q, 10);
  const goals = useGoalSearch(q, !isGuest, 5);

  const lower = q.toLowerCase();
  const projectHits = useMemo(
    () =>
      lower
        ? projects.filter((p) => !p.archived && !p.is_template && p.name.toLowerCase().includes(lower)).slice(0, 6)
        : [],
    [projects, lower],
  );
  const peopleHits = useMemo(
    () =>
      lower
        ? people
            .filter((p) => p.full_name.toLowerCase().includes(lower) || p.email.toLowerCase().includes(lower))
            .slice(0, 5)
        : [],
    [people, lower],
  );
  const recentProjects = useMemo(() => {
    const fav = new Set(favorites);
    const activity = (id: string) => stats?.get(id)?.last_activity_at ?? "";
    return projects
      .filter((p) => !p.archived && !p.is_template)
      .sort((a, b) => Number(fav.has(b.id)) - Number(fav.has(a.id)) || activity(b.id).localeCompare(activity(a.id)))
      .slice(0, 5);
  }, [projects, favorites, stats]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const searching = query.trim().length > 0;
  const pending = searching && (q !== query.trim() || tasks.isFetching);
  const taskHits = searching ? (tasks.data ?? []) : [];
  const goalHits = searching && !isGuest ? (goals.data ?? []) : [];
  const nothing =
    searching && !pending && !taskHits.length && !projectHits.length && !peopleHits.length && !goalHits.length;

  return (
    <Command shouldFilter={false} loop className="flex min-h-0 flex-col" label="Search">
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search size={16} className="shrink-0 text-faint" />
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Search tasks, projects, people, goals…"
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
        />
        {pending && <Spinner size={14} />}
        <span className="hidden sm:inline">
          <Kbd>Esc</Kbd>
        </span>
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto py-1 scrollbar-thin">
        {nothing && (
          <div className="px-4 py-8 text-center text-sm text-muted">No results for “{query.trim()}”</div>
        )}

        {!searching && (
          <>
            <Command.Group heading="Quick links" className={groupClass}>
              <Command.Item value="nav-home" onSelect={() => go("/home")} className={itemClass}>
                <Home size={15} className="text-muted" /> Home
              </Command.Item>
              <Command.Item value="nav-my-tasks" onSelect={() => go("/my-tasks")} className={itemClass}>
                <CheckCircle2 size={15} className="text-muted" /> My tasks
              </Command.Item>
              <Command.Item value="nav-inbox" onSelect={() => go("/inbox")} className={itemClass}>
                <Inbox size={15} className="text-muted" /> Inbox
              </Command.Item>
              {!isGuest && (
                <Command.Item value="nav-goals" onSelect={() => go("/goals")} className={itemClass}>
                  <Target size={15} className="text-muted" /> Goals
                </Command.Item>
              )}
            </Command.Group>
            {recentProjects.length > 0 && (
              <Command.Group heading="Recent projects" className={groupClass}>
                {recentProjects.map((p) => (
                  <Command.Item key={p.id} value={`recent-${p.id}`} onSelect={() => go(routes.project(p.id))} className={itemClass}>
                    <ProjectIcon color={p.color} />
                    <span className="truncate">{p.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </>
        )}

        {taskHits.length > 0 && (
          <Command.Group heading="Tasks" className={groupClass}>
            {taskHits.map((t) => (
              <Command.Item
                key={t.id}
                value={`task-${t.id}`}
                onSelect={() => {
                  onClose();
                  openTask(t.id);
                }}
                className={itemClass}
              >
                <CheckCircle2 size={15} className={cn("shrink-0", t.completed ? "text-success" : "text-faint")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate", t.completed && "text-muted line-through")}>
                    {t.name || "Untitled task"}
                  </span>
                  {t.project && (
                    <span className="flex items-center gap-1 truncate text-[11.5px] text-faint">
                      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colorHex(t.project.color) }} />
                      {t.project.name}
                    </span>
                  )}
                </span>
                {t.due_date && (
                  <span className={cn("shrink-0 text-xs", DUE_TONE_CLASS[dueTone(t.due_date, t.completed)])}>
                    {formatDue(t.due_date)}
                  </span>
                )}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {projectHits.length > 0 && (
          <Command.Group heading="Projects" className={groupClass}>
            {projectHits.map((p) => (
              <Command.Item key={p.id} value={`project-${p.id}`} onSelect={() => go(routes.project(p.id))} className={itemClass}>
                <ProjectIcon color={p.color} />
                <span className="truncate">{p.name}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {peopleHits.length > 0 && (
          <Command.Group heading="People" className={groupClass}>
            {peopleHits.map((p) => (
              <Command.Item
                key={p.id}
                value={`person-${p.id}`}
                onSelect={() => go(`/search?assignee=${p.id}`)}
                className={itemClass}
              >
                <Avatar profile={p} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.full_name || p.email}</span>
                  <span className="block truncate text-[11.5px] text-faint">{p.title || p.email}</span>
                </span>
                <span className="hidden text-[11.5px] text-faint sm:inline">View tasks</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {goalHits.length > 0 && (
          <Command.Group heading="Goals" className={groupClass}>
            {goalHits.map((g) => (
              <Command.Item key={g.id} value={`goal-${g.id}`} onSelect={() => go(routes.goal(g.id))} className={itemClass}>
                <Target size={15} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                {g.status && <StatusPill status={g.status} />}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {searching && (
          <Command.Group className={groupClass}>
            <Command.Item
              value="see-all"
              onSelect={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}
              className={itemClass}
            >
              <Search size={15} className="text-muted" />
              <span className="flex-1 truncate">
                See all results for <b className="font-semibold">“{query.trim()}”</b>
              </span>
              <CornerDownLeft size={13} className="text-faint" />
            </Command.Item>
          </Command.Group>
        )}
      </Command.List>
    </Command>
  );
}

function ProjectIcon({ color }: { color: string }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white" style={{ background: colorHex(color) }}>
      <LayoutGrid size={12} />
    </span>
  );
}
