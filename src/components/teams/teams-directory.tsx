"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Users } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useProfileMap, useTeamMembers } from "@/lib/queries/people";
import { useAddTeamMember, useAllTeams, useRemoveTeamMember } from "@/lib/queries/teams";
import { AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageLoader } from "@/components/ui/misc";
import { colorHex, errorMessage } from "@/lib/utils";
import { CreateTeamDialog } from "./create-team-dialog";
import type { Team } from "@/types/models";
import { routes } from "@/lib/routes";

export function TeamsDirectory() {
  const me = useMe();
  const isGuest = me.role === "guest";
  const { data: teams = [], isLoading } = useAllTeams();
  const { data: members = [] } = useTeamMembers();
  const people = useProfileMap();
  const join = useAddTeamMember();
  const leave = useRemoveTeamMember();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const byTeam = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of members) {
      const list = map.get(m.team_id) ?? [];
      list.push(m.user_id);
      map.set(m.team_id, list);
    }
    return map;
  }, [members]);

  const archivedCount = teams.filter((t) => t.archived).length;
  const needle = q.trim().toLowerCase();
  const visible = teams.filter(
    (t) =>
      t.archived === showArchived &&
      (!needle || t.name.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle)),
  );
  const mine = visible.filter((t) => byTeam.get(t.id)?.includes(me.id));
  const others = visible.filter((t) => !byTeam.get(t.id)?.includes(me.id));

  const toggleMembership = (team: Team, isMember: boolean) => {
    const opts = {
      onSuccess: () => toast.success(isMember ? `You left ${team.name}` : `You joined ${team.name}`),
      onError: (err: unknown) => toast.error(errorMessage(err)),
    };
    if (isMember) leave.mutate({ teamId: team.id, userId: me.id }, opts);
    else join.mutate({ teamId: team.id, userId: me.id }, opts);
  };

  const card = (team: Team) => {
    const ids = byTeam.get(team.id) ?? [];
    const isMember = ids.includes(me.id);
    return (
      <div key={team.id} className="flex flex-col rounded-xl border border-border bg-surface p-4 hover:border-border-strong">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ background: colorHex(team.color) }}
          >
            <Users size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <Link href={routes.team(team.id)} className="block truncate font-semibold hover:underline">
              {team.name}
            </Link>
            <div className="text-xs text-muted">
              {ids.length} {ids.length === 1 ? "member" : "members"}
              {team.archived && " · Archived"}
            </div>
          </div>
        </div>
        <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted">
          {team.description || <span className="text-faint">No description</span>}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <AvatarStack profiles={ids.map((id) => people.get(id))} max={5} />
          {!team.archived && (isMember || !isGuest) && (
            <Button
              size="xs"
              variant={isMember ? "ghost" : "secondary"}
              onClick={() => toggleMembership(team, isMember)}
              disabled={join.isPending || leave.isPending}
            >
              {isMember ? "Leave" : "Join"}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Teams</h1>
          <p className="text-sm text-muted">Join a team to see its projects in your sidebar.</p>
        </div>
        {!isGuest && (
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> Create team
          </Button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teams" className="pl-8" aria-label="Search teams" />
        </div>
        {archivedCount > 0 && (
          <Button variant="ghost" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Show active teams" : `Show archived (${archivedCount})`}
          </Button>
        )}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Users size={32} />}
          title={needle ? "No teams match" : showArchived ? "No archived teams" : "No teams yet"}
          description={!needle && !showArchived && !isGuest ? "Create a team to group people and projects." : undefined}
          action={
            !needle && !showArchived && !isGuest ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus size={15} /> Create team
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {mine.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">Your teams</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{mine.map(card)}</div>
            </section>
          )}
          {others.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">
                {mine.length > 0 ? "Other teams" : "All teams"}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{others.map(card)}</div>
            </section>
          )}
        </div>
      )}

      <CreateTeamDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
