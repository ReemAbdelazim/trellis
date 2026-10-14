"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Briefcase,
  Lock,
  MoreHorizontal,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { Label, Select } from "@/components/ui/input";
import {
  ColorDot,
  ColorSwatches,
  ConfirmDialog,
  EmptyState,
  InlineEdit,
  PageLoader,
  StatusPill,
} from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserPicker } from "@/components/ui/user-picker";
import { GoalProgress } from "@/components/goals/goal-bits";
import { useIsAdmin, useIsGuest, useMe } from "@/lib/queries/me";
import { useProfileMap, useProfiles } from "@/lib/queries/people";
import { useProjects, useProjectStats } from "@/lib/queries/projects";
import {
  aggregateProgress,
  useCanEditPortfolio,
  useDeletePortfolio,
  useLatestProjectStatusDates,
  usePortfolio,
  useSetPortfolioMember,
  useSetPortfolioProject,
  useUpdatePortfolio,
  type PortfolioItem,
} from "@/lib/queries/portfolios";
import { cn, colorHex, DUE_TONE_CLASS, dueTone, errorMessage, formatDue, nextPosition, positionBetween, timeAgo } from "@/lib/utils";
import type { Project, ProjectStats, StatusColor } from "@/types/models";
import { ProjectPicker } from "./project-picker";
import { PrivacyToggle } from "./portfolios-view";
import { routes } from "@/lib/routes";

export function PortfolioDetail({ portfolioId }: { portfolioId: string }) {
  const isGuest = useIsGuest();
  if (isGuest) {
    return (
      <EmptyState
        icon={<Briefcase size={32} />}
        title="Portfolios are for members"
        description="Portfolios are shared with full members of the workspace."
      />
    );
  }
  return <PortfolioInner portfolioId={portfolioId} />;
}

function PortfolioInner({ portfolioId }: { portfolioId: string }) {
  const me = useMe();
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const { data: portfolio, isLoading } = usePortfolio(portfolioId);
  const canEdit = useCanEditPortfolio(portfolioId);
  const { data: stats } = useProjectStats();
  const update = useUpdatePortfolio();
  const del = useDeletePortfolio();
  const people = useProfileMap();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  if (isLoading) return <PageLoader />;
  if (!portfolio) {
    return (
      <EmptyState
        icon={<Briefcase size={32} />}
        title="Portfolio not found"
        description="It may be private or have been deleted."
        action={
          <Link href="/portfolios" className="text-sm text-accent hover:underline">
            Back to portfolios
          </Link>
        }
      />
    );
  }

  const isOwner = isAdmin || portfolio.owner_id === me.id;
  const progress = aggregateProgress(
    portfolio.projects.map((p) => p.project_id),
    stats,
  );
  const memberProfiles = [portfolio.owner_id, ...portfolio.members.map((m) => m.user_id)]
    .filter((id, i, arr): id is string => !!id && arr.indexOf(id) === i)
    .map((id) => people.get(id));

  const remove = async () => {
    try {
      await del.mutateAsync(portfolio.id);
      toast.success("Portfolio deleted");
      router.push("/portfolios");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <Link href="/portfolios" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={14} /> Portfolios
      </Link>

      <div className="mb-5 flex flex-wrap items-start gap-3">
        <PortfolioIcon portfolio={portfolio} canEdit={isOwner} onColor={(color) => update.mutate({ id: portfolio.id, color })} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <InlineEdit
              value={portfolio.name}
              disabled={!isOwner}
              onSave={(name) => update.mutate({ id: portfolio.id, name })}
              className="text-xl font-semibold"
              inputClassName="text-xl font-semibold"
            />
            {portfolio.is_private && <Lock size={14} className="shrink-0 text-faint" aria-label="Private" />}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <GoalProgress value={progress} className="w-48" />
            <span className="text-xs text-muted">
              {portfolio.projects.length} {portfolio.projects.length === 1 ? "project" : "projects"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMembersOpen(true)}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2"
            aria-label="Portfolio members"
          >
            <AvatarStack profiles={memberProfiles} max={4} />
            <Users size={15} className="text-muted" />
          </button>
          {isOwner && (
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Portfolio actions">
                  <MoreHorizontal size={16} />
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem danger icon={<Trash2 size={14} />} onSelect={() => setConfirmDelete(true)}>
                  Delete portfolio
                </MenuItem>
              </MenuContent>
            </Menu>
          )}
        </div>
      </div>

      <ProjectsTable portfolio={portfolio} canEdit={canEdit} stats={stats} />

      <MembersDialog
        open={membersOpen}
        onOpenChange={setMembersOpen}
        portfolio={portfolio}
        canEdit={canEdit}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this portfolio?"
        description="The projects themselves are not affected. This can't be undone."
        onConfirm={remove}
        pending={del.isPending}
      />
    </div>
  );
}

function PortfolioIcon({
  portfolio,
  canEdit,
  onColor,
}: {
  portfolio: PortfolioItem;
  canEdit: boolean;
  onColor: (c: string) => void;
}) {
  const icon = (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
      style={{ background: colorHex(portfolio.color) }}
    >
      <Briefcase size={19} />
    </span>
  );
  if (!canEdit) return icon;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Change color" className="rounded-lg hover:opacity-90">
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3">
        <ColorSwatches value={portfolio.color} onChange={onColor} />
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Projects table
// ---------------------------------------------------------------------------

type SortKey = "manual" | "name" | "status" | "owner" | "due" | "progress" | "overdue" | "updated";

const STATUS_ORDER: Record<StatusColor, number> = { off_track: 0, at_risk: 1, on_hold: 2, on_track: 3, complete: 4 };

interface Row {
  projectId: string;
  position: number;
  project?: Project;
  stats?: ProjectStats;
  progress: number;
  lastUpdate?: string;
}

const COLS = "grid-cols-[40px_minmax(200px,1.6fr)_100px_120px_96px_140px_72px_96px_32px]";

function ProjectsTable({
  portfolio,
  canEdit,
  stats,
}: {
  portfolio: PortfolioItem;
  canEdit: boolean;
  stats: Map<string, ProjectStats> | undefined;
}) {
  const { data: projects = [] } = useProjects();
  const people = useProfileMap();
  const setProject = useSetPortfolioProject(portfolio.id);
  const ids = portfolio.projects.map((p) => p.project_id);
  const { data: latest } = useLatestProjectStatusDates(ids);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "manual", dir: 1 });

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const rows: Row[] = useMemo(() => {
    const base = portfolio.projects.map((pp) => ({
      projectId: pp.project_id,
      position: pp.position,
      project: byId.get(pp.project_id),
      stats: stats?.get(pp.project_id),
      progress: aggregateProgress([pp.project_id], stats),
      lastUpdate: latest?.get(pp.project_id),
    }));
    if (sort.key === "manual") return base;
    const ownerName = (r: Row) => {
      const o = r.project?.owner_id ? people.get(r.project.owner_id) : undefined;
      return o?.full_name || o?.email || "";
    };
    // Empty values always sort last regardless of direction.
    const val = (r: Row): string | number | null => {
      switch (sort.key) {
        case "name":
          return r.project?.name.toLowerCase() ?? null;
        case "status":
          return r.project?.current_status ? STATUS_ORDER[r.project.current_status] : null;
        case "owner":
          return ownerName(r).toLowerCase() || null;
        case "due":
          return r.project?.due_date ?? null;
        case "progress":
          return r.progress;
        case "overdue":
          return r.stats?.overdue_tasks ?? 0;
        case "updated":
          return r.lastUpdate ?? null;
        default:
          return r.position;
      }
    };
    return [...base].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === vb) return a.position - b.position;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va < vb ? -1 : 1) * sort.dir;
    });
  }, [portfolio.projects, byId, stats, latest, sort, people]);

  const manual = sort.key === "manual";
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const before = delta === -1 ? rows[target - 1]?.position : rows[target].position;
    const after = delta === -1 ? rows[target].position : rows[target + 1]?.position;
    setProject.mutate({ projectId: rows[index].projectId, position: positionBetween(before, after) });
  };

  const header = (key: SortKey, label: string, className?: string) => {
    const active = sort.key === key;
    return (
      <button
        type="button"
        onClick={() =>
          setSort((s) => (s.key === key ? (s.dir === 1 ? { key, dir: -1 } : { key: "manual", dir: 1 }) : { key, dir: 1 }))
        }
        className={cn("flex items-center gap-1 text-left uppercase hover:text-text", active && "text-text", className)}
      >
        {label}
        {active ? (
          sort.dir === 1 ? (
            <ArrowUp size={11} />
          ) : (
            <ArrowDown size={11} />
          )
        ) : (
          <ArrowUpDown size={11} className="opacity-40" />
        )}
      </button>
    );
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Projects</h2>
        <div className="flex items-center gap-2">
          {!manual && (
            <Button size="xs" variant="ghost" onClick={() => setSort({ key: "manual", dir: 1 })}>
              Clear sort
            </Button>
          )}
          {canEdit && (
            <ProjectPicker
              exclude={ids}
              align="end"
              onPick={(projectId) => setProject.mutate({ projectId, position: nextPosition(portfolio.projects) })}
            >
              <Button size="sm" variant="primary">
                <Plus size={14} /> Add project
              </Button>
            </ProjectPicker>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border">
          <EmptyState
            title="No projects in this portfolio"
            description={canEdit ? "Add projects to track their status and progress together." : undefined}
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface scrollbar-thin">
          <div className="min-w-[900px]">
            <div
              className={cn(
                "grid items-center gap-3 border-b border-border px-3 py-2 text-[11px] font-semibold tracking-wide text-faint",
                COLS,
              )}
            >
              <span />
              {header("name", "Name")}
              {header("status", "Status")}
              {header("owner", "Owner")}
              {header("due", "Due")}
              {header("progress", "Progress")}
              {header("overdue", "Overdue")}
              {header("updated", "Updated")}
              <span />
            </div>
            {rows.map((r, i) => {
              const p = r.project;
              const owner = p?.owner_id ? people.get(p.owner_id) : undefined;
              const overdue = r.stats?.overdue_tasks ?? 0;
              return (
                <div
                  key={r.projectId}
                  className={cn("group grid items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-2", COLS)}
                >
                  <div className="flex flex-col">
                    {canEdit && manual ? (
                      <>
                        <button
                          type="button"
                          aria-label="Move up"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                          className="flex h-4 items-center justify-center rounded text-faint hover:text-text disabled:opacity-30"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          aria-label="Move down"
                          disabled={i === rows.length - 1}
                          onClick={() => move(i, 1)}
                          className="flex h-4 items-center justify-center rounded text-faint hover:text-text disabled:opacity-30"
                        >
                          <ArrowDown size={12} />
                        </button>
                      </>
                    ) : (
                      <span className="text-center text-xs text-faint tabular-nums">{i + 1}</span>
                    )}
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <ColorDot color={p?.color} />
                    {p ? (
                      <Link href={routes.project(p.id)} className="truncate text-sm font-medium hover:underline">
                        {p.name}
                      </Link>
                    ) : (
                      <span className="truncate text-sm text-faint">Private project</span>
                    )}
                  </div>
                  <span>{p && <StatusPill status={p.current_status} />}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {owner && (
                      <>
                        <Avatar profile={owner} size="xs" />
                        <span className="truncate text-xs">{owner.full_name || owner.email}</span>
                      </>
                    )}
                  </span>
                  <span className={cn("text-xs", p?.due_date ? DUE_TONE_CLASS[dueTone(p.due_date)] : "text-faint")}>
                    {p?.due_date ? formatDue(p.due_date) : "—"}
                  </span>
                  <GoalProgress value={r.progress} />
                  <span className={cn("text-xs tabular-nums", overdue > 0 ? "font-medium text-danger" : "text-faint")}>
                    {overdue}
                  </span>
                  <span className="text-xs text-muted" title={r.lastUpdate ? format(new Date(r.lastUpdate), "PPp") : undefined}>
                    {r.lastUpdate ? timeAgo(r.lastUpdate) : "—"}
                  </span>
                  <span>
                    {canEdit && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Remove from portfolio"
                        className="sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                        onClick={() => setProject.mutate({ projectId: r.projectId, position: null })}
                      >
                        <X size={13} />
                      </Button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members & privacy
// ---------------------------------------------------------------------------

function MembersDialog({
  open,
  onOpenChange,
  portfolio,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  portfolio: PortfolioItem;
  canEdit: boolean;
}) {
  const people = useProfileMap();
  const { data: profiles = [] } = useProfiles();
  const setMember = useSetPortfolioMember(portfolio.id);
  const update = useUpdatePortfolio();
  const owner = portfolio.owner_id ? people.get(portfolio.owner_id) : undefined;
  const existing = new Set([portfolio.owner_id, ...portfolio.members.map((m) => m.user_id)]);
  const guestIds = new Set(profiles.filter((p) => p.role === "guest").map((p) => p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Members & privacy">
      <div className="space-y-4">
        <PrivacyToggle
          value={portfolio.is_private}
          disabled={!canEdit}
          onChange={(is_private) => update.mutate({ id: portfolio.id, is_private })}
        />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="mb-0">Members</Label>
            {canEdit && (
              <UserPicker
                value={null}
                allowClear={false}
                align="end"
                placeholder="Add a member…"
                filter={(id) => !existing.has(id) && !guestIds.has(id)}
                onChange={(id) => id && setMember.mutate({ userId: id, canEdit: false })}
              >
                <Button size="xs" variant="ghost">
                  <Plus size={13} /> Add member
                </Button>
              </UserPicker>
            )}
          </div>
          <ul className="divide-y divide-border rounded-md border border-border">
            <li className="flex items-center gap-2 px-3 py-2">
              <Avatar profile={owner} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm">{owner?.full_name || owner?.email || "No owner"}</span>
              <span className="text-xs text-muted">Owner</span>
            </li>
            {portfolio.members
              .filter((m) => m.user_id !== portfolio.owner_id)
              .map((m) => {
                const p = people.get(m.user_id);
                return (
                  <li key={m.user_id} className="flex items-center gap-2 px-3 py-2">
                    <Avatar profile={p} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{p?.full_name || p?.email || "Unknown"}</span>
                    {canEdit ? (
                      <>
                        <Select
                          aria-label="Permission"
                          value={m.can_edit ? "edit" : "view"}
                          onChange={(e) => setMember.mutate({ userId: m.user_id, canEdit: e.target.value === "edit" })}
                          className="h-7 w-28 text-xs"
                        >
                          <option value="edit">Can edit</option>
                          <option value="view">Can view</option>
                        </Select>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Remove member"
                          onClick={() => setMember.mutate({ userId: m.user_id, canEdit: null })}
                        >
                          <X size={13} />
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted">{m.can_edit ? "Can edit" : "Can view"}</span>
                    )}
                  </li>
                );
              })}
          </ul>
          {!portfolio.is_private && (
            <p className="mt-2 text-xs text-muted">
              Everyone at Seeds can view this portfolio. Members with edit access can change its projects.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
