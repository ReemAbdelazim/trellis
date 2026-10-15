"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderOpen, Plus, Search, Star } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useProfileMap, useTeams } from "@/lib/queries/people";
import { useFavorites, useProjects, useProjectStats, useToggleFavorite } from "@/lib/queries/projects";
import { CreateProjectDialog } from "@/components/project/create-project-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ColorDot, EmptyState, PageLoader, Pill, ProgressBar, StatusPill } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, DUE_TONE_CLASS, dueTone, errorMessage, formatDue, timeAgo } from "@/lib/utils";
import { useProjectMemberships } from "./use-project-memberships";
import type { Project, ProjectStats } from "@/types/models";
import { routes } from "@/lib/routes";

type Scope = "all" | "mine" | "favorites" | "templates" | "archived";
type Sort = "name" | "updated" | "due";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "all", label: "All projects" },
  { value: "mine", label: "My projects" },
  { value: "favorites", label: "Favorites" },
  { value: "templates", label: "Templates" },
  { value: "archived", label: "Archived" },
];

/** Latest of the project's own edit time and its newest task change. */
function lastUpdated(p: Project, stats: Map<string, ProjectStats> | undefined) {
  const activity = stats?.get(p.id)?.last_activity_at;
  return activity && activity > p.updated_at ? activity : p.updated_at;
}

export function ProjectsBrowser() {
  const me = useMe();
  const isGuest = me.role === "guest";
  const { data: projects = [], isLoading } = useProjects();
  const { data: stats } = useProjectStats();
  const { data: teams = [] } = useTeams();
  const { data: favorites = [] } = useFavorites();
  const { byProject } = useProjectMemberships();
  const toggleFav = useToggleFavorite();
  const people = useProfileMap();

  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [teamId, setTeamId] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [createOpen, setCreateOpen] = useState(false);

  const teamNames = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const isMine = (p: Project) => p.owner_id === me.id || p.created_by === me.id || !!byProject.get(p.id)?.has(me.id);
    const filtered = projects.filter((p) => {
      if (scope === "archived" ? !p.archived : p.archived) return false;
      if (scope === "templates" ? !p.is_template : scope !== "archived" && p.is_template) return false;
      if (scope === "mine" && !isMine(p)) return false;
      if (scope === "favorites" && !favSet.has(p.id)) return false;
      if (teamId === "none" ? p.team_id : teamId && p.team_id !== teamId) return false;
      if (needle && !p.name.toLowerCase().includes(needle) && !p.description.toLowerCase().includes(needle)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === "updated") return lastUpdated(b, stats).localeCompare(lastUpdated(a, stats));
      if (sort === "due") {
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [projects, q, scope, teamId, sort, favSet, byProject, me.id, stats]);

  const favorite = (p: Project) => {
    const next = !favSet.has(p.id);
    toggleFav.mutate(
      { projectId: p.id, favorite: next },
      { onError: (err) => toast.error(errorMessage(err)) },
    );
  };

  const filtersActive = !!q.trim() || scope !== "all" || !!teamId;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-muted">
            {isGuest ? "Projects that have been shared with you." : "Every project you can see."}
          </p>
        </div>
        {!isGuest && (
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> New project
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects"
            className="pl-8"
            aria-label="Search projects"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
          <Select aria-label="Show" value={scope} onChange={(e) => setScope(e.target.value as Scope)} className="lg:w-40">
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          {teams.length > 0 && (
            <Select aria-label="Team" value={teamId} onChange={(e) => setTeamId(e.target.value)} className="lg:w-44">
              <option value="">All teams</option>
              <option value="none">No team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
          <Select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="lg:w-44">
            <option value="name">Sort: Name</option>
            <option value="updated">Sort: Recently updated</option>
            <option value="due">Sort: Due date</option>
          </Select>
        </div>
        {filtersActive && (
          <Button
            variant="ghost"
            className="self-start lg:self-auto"
            onClick={() => {
              setQ("");
              setScope("all");
              setTeamId("");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={<FolderOpen size={32} />}
            title={filtersActive ? "No projects match" : "No projects yet"}
            description={
              filtersActive
                ? "Try a different search or filter."
                : isGuest
                  ? "When someone shares a project with you it will appear here."
                  : "Create a project to start organizing work."
            }
            action={
              !filtersActive && !isGuest ? (
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  <Plus size={15} /> New project
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface scrollbar-thin">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="w-10 py-2 pl-3" />
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Team</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="w-44 px-3 py-2 font-medium">Progress</th>
                <th className="px-3 py-2 font-medium">Members</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const s = stats?.get(p.id);
                const total = s?.total_tasks ?? 0;
                const done = s?.completed_tasks ?? 0;
                const pct = total ? Math.round((done / total) * 100) : 0;
                const owner = p.owner_id ? people.get(p.owner_id) : undefined;
                const isFav = favSet.has(p.id);
                const memberCount = byProject.get(p.id)?.size ?? 0;
                return (
                  <tr key={p.id} className="group border-b border-border last:border-0 hover:bg-surface-2/50">
                    <td className="py-2.5 pl-3">
                      <button
                        type="button"
                        onClick={() => favorite(p)}
                        aria-label={isFav ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`}
                        aria-pressed={isFav}
                        className={cn(
                          "rounded p-1 hover:bg-surface-3",
                          isFav ? "text-warning" : "text-faint opacity-60 group-hover:opacity-100",
                        )}
                      >
                        <Star size={15} fill={isFav ? "currentColor" : "none"} />
                      </button>
                    </td>
                    <td className="max-w-80 py-2.5 pr-3">
                      <Link href={routes.project(p.id)} className="flex min-w-0 items-center gap-2 font-medium hover:underline">
                        <ColorDot color={p.color} className="h-3 w-3" />
                        <span className="truncate">{p.name}</span>
                        {p.is_template && <Pill className="bg-info-soft text-info">Template</Pill>}
                        {p.archived && <Pill className="bg-surface-3 text-muted">Archived</Pill>}
                      </Link>
                    </td>
                    <td className="max-w-40 truncate px-3 py-2.5 text-muted">
                      {p.team_id ? (
                        <Link href={routes.team(p.team_id)} className="hover:underline">
                          {teamNames.get(p.team_id) ?? "Team"}
                        </Link>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {owner ? <Avatar profile={owner} size="sm" tooltip /> : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={p.current_status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Tooltip content={`${done} of ${total} tasks complete`}>
                        <div className="flex items-center gap-2">
                          <ProgressBar value={pct} />
                          <span className="w-9 shrink-0 text-right text-xs text-muted tabular-nums">{pct}%</span>
                        </div>
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2.5 text-muted tabular-nums">{memberCount || <span className="text-faint">—</span>}</td>
                    <td className={cn("px-3 py-2.5 whitespace-nowrap", p.due_date ? DUE_TONE_CLASS[dueTone(p.due_date)] : "text-faint")}>
                      {p.due_date ? formatDue(p.due_date) : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted">{timeAgo(lastUpdated(p, stats))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && list.length > 0 && (
        <p className="mt-2 text-xs text-faint">
          {list.length} {list.length === 1 ? "project" : "projects"}
        </p>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
