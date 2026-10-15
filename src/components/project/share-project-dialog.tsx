"use client";

import { useState } from "react";
import { Globe, Lock, UserPlus, Users } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useProfileMap, useTeams } from "@/lib/queries/people";
import { useProjectMembers, useSetProjectMember, useUpdateProject } from "@/lib/queries/projects";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { UserPicker } from "@/components/ui/user-picker";
import { InviteDialog } from "@/components/shell/invite-dialog";
import type { Project, ProjectPrivacy, ProjectRole } from "@/types/models";

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Project admin",
  editor: "Editor",
  commenter: "Commenter",
  viewer: "Viewer",
};

export function ShareProjectDialog({
  open,
  onOpenChange,
  project,
  access,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project: Project;
  access: ProjectRole | null;
}) {
  const me = useMe();
  const people = useProfileMap();
  const { data: teams = [] } = useTeams();
  const { data: members = [] } = useProjectMembers(project.id);
  const setMember = useSetProjectMember();
  const update = useUpdateProject();
  const [inviteOpen, setInviteOpen] = useState(false);
  const isOwner = access === "owner";
  const canAdd = access === "owner" || access === "editor";
  const team = teams.find((t) => t.id === project.team_id);

  const memberIds = members.map((m) => m.user_id);
  const owners = members.filter((m) => m.role === "owner");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} title={`Share “${project.name}”`} className="max-w-xl">
        <div className="space-y-5">
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted">Access</div>
            <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
              <span className="text-muted">
                {project.privacy === "private" ? <Lock size={16} /> : project.privacy === "team" ? <Users size={16} /> : <Globe size={16} />}
              </span>
              <Select
                value={project.privacy}
                disabled={!isOwner}
                onChange={(e) => update.mutate({ id: project.id, privacy: e.target.value as ProjectPrivacy })}
                className="h-8 flex-1 border-0 px-0 focus:ring-0"
                aria-label="Project privacy"
              >
                <option value="public">Workspace — everyone can find and edit</option>
                <option value="team">Team — members of {team?.name ?? "the project's team"}</option>
                <option value="private">Private — only members listed below</option>
              </Select>
            </div>
            {!isOwner && <p className="mt-1 text-xs text-faint">Only project admins can change access.</p>}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">Members ({members.length})</span>
              {canAdd && (
                <div className="flex gap-1.5">
                  <UserPicker
                    value={null}
                    allowClear={false}
                    filter={(id) => !memberIds.includes(id)}
                    onChange={(id) => id && setMember.mutate({ projectId: project.id, userId: id, role: "editor" })}
                    align="end"
                  >
                    <Button size="xs" variant="secondary">
                      <UserPlus size={13} /> Add member
                    </Button>
                  </UserPicker>
                  {me.role !== "guest" && (
                    <Button size="xs" variant="ghost" onClick={() => setInviteOpen(true)}>
                      Invite by email
                    </Button>
                  )}
                </div>
              )}
            </div>
            <ul className="divide-y divide-border rounded-md border border-border">
              {members.map((m) => {
                const p = people.get(m.user_id);
                const lastOwner = m.role === "owner" && owners.length === 1;
                return (
                  <li key={m.user_id} className="flex items-center gap-3 px-3 py-2">
                    <Avatar profile={p} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        {p?.full_name ?? "Unknown"} {m.user_id === me.id && <span className="text-faint">(you)</span>}
                      </div>
                      <div className="truncate text-xs text-faint">
                        {p?.email}
                        {p?.role === "guest" && " · Guest"}
                      </div>
                    </div>
                    <Select
                      value={m.role}
                      disabled={!isOwner || lastOwner}
                      onChange={(e) =>
                        setMember.mutate({ projectId: project.id, userId: m.user_id, role: e.target.value as ProjectRole })
                      }
                      className="h-8 w-36 text-xs"
                      aria-label="Member role"
                    >
                      {Object.entries(ROLE_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                    {(isOwner || m.user_id === me.id) && !lastOwner && (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-danger"
                        onClick={() => setMember.mutate({ projectId: project.id, userId: m.user_id, role: null })}
                      >
                        {m.user_id === me.id ? "Leave" : "Remove"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-faint">
              Editors can add and change tasks. Commenters can comment and attach files. Viewers can only see. Guests only
              see projects they&apos;re members of.
            </p>
          </div>
        </div>
      </Dialog>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} defaultProjectId={project.id} />
    </>
  );
}
