"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  FolderPlus,
  MoreHorizontal,
  Palette,
  Shield,
  ShieldOff,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useProfileMap, useTeamMembers } from "@/lib/queries/people";
import { useProjects, useProjectStats } from "@/lib/queries/projects";
import {
  useAddTeamMember,
  useDeleteTeam,
  useIsTeamAdmin,
  useRemoveTeamMember,
  useSetTeamAdmin,
  useTeam,
  useUpdateTeam,
} from "@/lib/queries/teams";
import { CreateProjectDialog } from "@/components/project/create-project-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { ColorDot, ColorSwatches, ConfirmDialog, EmptyState, InlineEdit, PageLoader, Pill, ProgressBar, StatusPill } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { UserPicker } from "@/components/ui/user-picker";
import { colorHex, errorMessage, formatDue } from "@/lib/utils";
import { routes } from "@/lib/routes";

export function TeamPage({ teamId }: { teamId: string }) {
  const me = useMe();
  const router = useRouter();
  const isGuest = me.role === "guest";
  const { data: team, isLoading } = useTeam(teamId);
  const { data: isTeamAdmin = false } = useIsTeamAdmin(teamId);
  const { data: allMembers = [] } = useTeamMembers();
  const { data: projects = [] } = useProjects();
  const { data: stats } = useProjectStats();
  const people = useProfileMap();
  const update = useUpdateTeam();
  const del = useDeleteTeam();
  const add = useAddTeamMember();
  const remove = useRemoveTeamMember();
  const setAdmin = useSetTeamAdmin();
  const [projectOpen, setProjectOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);

  const members = useMemo(
    () =>
      allMembers
        .filter((m) => m.team_id === teamId)
        .map((m) => ({ ...m, profile: people.get(m.user_id) }))
        .sort(
          (a, b) =>
            Number(b.is_admin) - Number(a.is_admin) ||
            (a.profile?.full_name ?? "").localeCompare(b.profile?.full_name ?? ""),
        ),
    [allMembers, teamId, people],
  );
  const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);
  const teamProjects = projects.filter((p) => p.team_id === teamId && !p.is_template);
  const activeProjects = teamProjects.filter((p) => !p.archived);
  const archivedProjects = teamProjects.filter((p) => p.archived);
  const shownProjects = showArchivedProjects ? archivedProjects : activeProjects;

  if (isLoading) return <PageLoader />;
  if (!team) {
    return (
      <EmptyState
        icon={<Users size={32} />}
        title="Team not found"
        description="This team doesn't exist or you don't have access to it."
        action={
          <Link href="/teams" className="text-sm text-accent hover:underline">
            Browse teams
          </Link>
        }
      />
    );
  }

  const isMember = memberIds.has(me.id);
  const canDelete = me.role === "admin" || team.created_by === me.id;
  const toastErr = (err: unknown) => toast.error(errorMessage(err));

  const rename = (name: string) => update.mutate({ id: teamId, name }, { onError: toastErr });
  const describe = (description: string) => update.mutate({ id: teamId, description }, { onError: toastErr });

  const doDelete = () =>
    del.mutate(teamId, {
      onSuccess: () => {
        toast.success(`Team “${team.name}” deleted`);
        router.push("/teams");
      },
      onError: toastErr,
    });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: colorHex(team.color) }}
        >
          <Users size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <InlineEdit
              value={team.name}
              onSave={rename}
              disabled={!isTeamAdmin}
              className="text-xl font-semibold"
              inputClassName="text-xl font-semibold"
            />
            {team.archived && <Pill className="bg-surface-3 text-muted">Archived</Pill>}
          </div>
          <div className="mt-0.5 text-sm text-muted">
            <InlineEdit
              value={team.description}
              onSave={describe}
              disabled={!isTeamAdmin}
              placeholder={isTeamAdmin ? "Add a description" : "No description"}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!team.archived && (isMember || !isGuest) && (
            <Button
              onClick={() =>
                (isMember ? remove : add).mutate(
                  { teamId, userId: me.id },
                  { onSuccess: () => toast.success(isMember ? "You left the team" : "You joined the team"), onError: toastErr },
                )
              }
              disabled={add.isPending || remove.isPending}
            >
              {isMember ? "Leave team" : "Join team"}
            </Button>
          )}
          {(isTeamAdmin || canDelete) && (
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Team options">
                  <MoreHorizontal size={16} />
                </Button>
              </MenuTrigger>
              <MenuContent align="end">
                {isTeamAdmin && (
                  <>
                    <MenuItem icon={<Palette size={14} />} onSelect={() => setColorOpen(true)}>
                      Change color
                    </MenuItem>
                    <MenuItem
                      icon={team.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      onSelect={() =>
                        update.mutate(
                          { id: teamId, archived: !team.archived },
                          {
                            onSuccess: () => toast.success(team.archived ? "Team restored" : "Team archived"),
                            onError: toastErr,
                          },
                        )
                      }
                    >
                      {team.archived ? "Restore team" : "Archive team"}
                    </MenuItem>
                  </>
                )}
                {canDelete && (
                  <>
                    <MenuSeparator />
                    <MenuItem danger icon={<Trash2 size={14} />} onSelect={() => setConfirmDelete(true)}>
                      Delete team…
                    </MenuItem>
                  </>
                )}
              </MenuContent>
            </Menu>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Projects */}
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">
              Projects <span className="text-sm font-normal text-faint">{activeProjects.length}</span>
            </h2>
            <div className="flex items-center gap-2">
              {archivedProjects.length > 0 && (
                <Button variant="ghost" size="xs" onClick={() => setShowArchivedProjects((v) => !v)}>
                  {showArchivedProjects ? "Show active" : `Archived (${archivedProjects.length})`}
                </Button>
              )}
              {!isGuest && !team.archived && (
                <Button variant="primary" onClick={() => setProjectOpen(true)}>
                  <FolderPlus size={14} /> New project
                </Button>
              )}
            </div>
          </div>
          {shownProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border">
              <EmptyState
                title={showArchivedProjects ? "No archived projects" : "No projects yet"}
                description={
                  showArchivedProjects ? undefined : "Projects created for this team show up here for everyone on it."
                }
                className="py-10"
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {shownProjects.map((p) => {
                const s = stats?.get(p.id);
                const total = s?.total_tasks ?? 0;
                const done = s?.completed_tasks ?? 0;
                const pct = total ? Math.round((done / total) * 100) : 0;
                const owner = p.owner_id ? people.get(p.owner_id) : undefined;
                return (
                  <Link
                    key={p.id}
                    href={routes.project(p.id)}
                    className="flex flex-col rounded-xl border border-border bg-surface p-4 hover:border-border-strong"
                  >
                    <div className="flex items-center gap-2">
                      <ColorDot color={p.color} className="h-3 w-3" />
                      <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                      {owner && <Avatar profile={owner} size="xs" tooltip />}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <StatusPill status={p.current_status} />
                      {p.due_date && <span className="text-xs text-muted">Due {formatDue(p.due_date)}</span>}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <ProgressBar value={pct} />
                      <span className="w-20 shrink-0 text-right text-xs text-muted tabular-nums">
                        {done}/{total} done
                      </span>
                    </div>
                    {!!s?.overdue_tasks && <div className="mt-1 text-xs text-danger">{s.overdue_tasks} overdue</div>}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Members */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">
              Members <span className="text-sm font-normal text-faint">{members.length}</span>
            </h2>
            {isTeamAdmin && !team.archived && (
              <UserPicker
                value={null}
                allowClear={false}
                align="end"
                placeholder="Add a member…"
                filter={(id) => !memberIds.has(id) && people.get(id)?.role !== "guest"}
                onChange={(userId) =>
                  userId &&
                  add.mutate(
                    { teamId, userId },
                    {
                      onSuccess: () => toast.success(`${people.get(userId)?.full_name || "Member"} added`),
                      onError: toastErr,
                    },
                  )
                }
              >
                <Button size="xs">
                  <UserPlus size={13} /> Add
                </Button>
              </UserPicker>
            )}
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {members.map((m) => {
              const self = m.user_id === me.id;
              return (
                <li key={m.user_id} className="flex items-center gap-2.5 px-3 py-2.5">
                  <Avatar profile={m.profile} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.profile?.full_name || m.profile?.email || "Former member"}
                      {self && <span className="ml-1 text-xs font-normal text-faint">(you)</span>}
                    </div>
                    <div className="truncate text-xs text-muted">{m.profile?.title || m.profile?.email}</div>
                  </div>
                  {m.is_admin && <Pill className="bg-accent-soft text-accent">Team admin</Pill>}
                  {isTeamAdmin && (
                    <Menu>
                      <MenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Member options">
                          <MoreHorizontal size={14} />
                        </Button>
                      </MenuTrigger>
                      <MenuContent align="end">
                        <MenuItem
                          icon={m.is_admin ? <ShieldOff size={14} /> : <Shield size={14} />}
                          onSelect={() =>
                            setAdmin.mutate({ teamId, userId: m.user_id, isAdmin: !m.is_admin }, { onError: toastErr })
                          }
                        >
                          {m.is_admin ? "Remove team admin" : "Make team admin"}
                        </MenuItem>
                        <MenuItem
                          danger
                          icon={<UserMinus size={14} />}
                          onSelect={() => remove.mutate({ teamId, userId: m.user_id }, { onError: toastErr })}
                        >
                          {self ? "Leave team" : "Remove from team"}
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  )}
                </li>
              );
            })}
            {members.length === 0 && <li className="px-3 py-6 text-center text-sm text-faint">No members yet</li>}
          </ul>
          <p className="mt-2 text-xs text-faint">
            Members can edit the team&apos;s team-visible projects. Guests need to be added to projects directly.
          </p>
        </section>
      </div>

      <Dialog open={colorOpen} onOpenChange={setColorOpen} title="Team color">
        <ColorSwatches
          value={team.color}
          onChange={(color) => update.mutate({ id: teamId, color }, { onError: toastErr })}
        />
      </Dialog>
      <CreateProjectDialog open={projectOpen} onOpenChange={setProjectOpen} defaultTeamId={teamId} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${team.name}?`}
        confirmLabel="Delete team"
        pending={del.isPending}
        onConfirm={doDelete}
        description={
          <div className="space-y-2">
            <p>The team and its member list are deleted. Its projects are kept but no longer belong to a team.</p>
            {teamProjects.some((p) => p.privacy === "team") && (
              <p className="rounded-md bg-warning-soft px-2.5 py-2 text-warning">
                Projects shared with “team” access will become visible to everyone in the workspace. Make them private
                first if they&apos;re sensitive — or archive the team instead.
              </p>
            )}
          </div>
        }
      />
    </div>
  );
}
