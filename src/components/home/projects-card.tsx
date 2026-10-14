"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FolderPlus, LayoutGrid, Plus, Star } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useFavorites, useProjects, useProjectStats } from "@/lib/queries/projects";
import { useMyProjectIds } from "@/lib/queries/home";
import { CreateProjectDialog } from "@/components/project/create-project-dialog";
import { EmptyState, ProgressBar, Spinner } from "@/components/ui/misc";
import { colorHex } from "@/lib/utils";
import { HomeCard } from "./card";
import { routes } from "@/lib/routes";

const LIMIT = 6;

export function HomeProjectsCard() {
  const me = useMe();
  const isGuest = me.role === "guest";
  const { data: projects = [], isLoading } = useProjects();
  const { data: stats } = useProjectStats();
  const { data: favorites = [] } = useFavorites();
  const { data: myIds = [] } = useMyProjectIds(me.id);
  const [createOpen, setCreateOpen] = useState(false);

  const shown = useMemo(() => {
    const fav = new Set(favorites);
    const mine = new Set(myIds);
    const active = projects.filter((p) => !p.archived && !p.is_template);
    const activity = (id: string) => stats?.get(id)?.last_activity_at ?? "";
    // Favourites first, then my projects, then anything else — each by recent activity.
    const rank = (id: string) => (fav.has(id) ? 0 : mine.has(id) ? 1 : 2);
    return [...active]
      .sort((a, b) => rank(a.id) - rank(b.id) || activity(b.id).localeCompare(activity(a.id)) || a.name.localeCompare(b.name))
      .slice(0, LIMIT);
  }, [projects, stats, favorites, myIds]);

  return (
    <HomeCard
      title="Projects"
      action={
        <Link href="/projects" className="text-[13px] text-muted hover:text-text">
          Browse all
        </Link>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {!isGuest && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong p-3 text-left text-[13.5px] text-muted hover:bg-surface-2 hover:text-text"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                <Plus size={18} />
              </span>
              Create project
            </button>
          )}
          {shown.map((p) => {
            const s = stats?.get(p.id);
            const total = s?.total_tasks ?? 0;
            const done = s?.completed_tasks ?? 0;
            const pct = total ? Math.round((done / total) * 100) : 0;
            return (
              <Link
                key={p.id}
                href={routes.project(p.id)}
                className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3 hover:border-border-strong hover:bg-surface-2/50"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ background: colorHex(p.color) }}
                >
                  <LayoutGrid size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="truncate text-[13.5px] font-medium">{p.name}</span>
                    {favorites.includes(p.id) && <Star size={12} className="shrink-0 fill-warning text-warning" />}
                  </span>
                  <ProgressBar value={pct} className="mt-1.5" />
                  <span className="mt-1 block text-[11.5px] text-faint">
                    {total ? `${done}/${total} tasks · ${pct}%` : "No tasks yet"}
                    {!!s?.overdue_tasks && <span className="text-danger"> · {s.overdue_tasks} overdue</span>}
                  </span>
                </span>
              </Link>
            );
          })}
          {!shown.length && isGuest && (
            <EmptyState
              className="py-8 sm:col-span-2"
              icon={<FolderPlus size={24} />}
              title="No projects yet"
              description="Projects you're invited to will appear here."
            />
          )}
        </div>
      )}
      {!isGuest && <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </HomeCard>
  );
}
