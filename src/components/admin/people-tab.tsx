"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { MoreHorizontal, Search, Trash2, UserCheck, UserX } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useProfiles } from "@/lib/queries/people";
import { useRemoveUser, useSetProfileAccess } from "@/lib/queries/admin";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ConfirmDialog, EmptyState, PageLoader, Pill } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, errorMessage, timeAgo } from "@/lib/utils";
import type { Profile, UserRole } from "@/types/models";

const ROLE_LABEL: Record<UserRole, string> = { admin: "Admin", member: "Member", guest: "Guest" };

export function PeopleTab() {
  const me = useMe();
  const { data: people = [], isLoading } = useProfiles();
  const setAccess = useSetProfileAccess();
  const remove = useRemoveUser();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<"all" | UserRole>("all");
  const [status, setStatus] = useState<"all" | Profile["status"]>("all");
  const [removing, setRemoving] = useState<Profile | null>(null);

  const counts = useMemo(() => {
    const active = people.filter((p) => p.status === "active");
    return {
      admins: active.filter((p) => p.role === "admin").length,
      members: active.filter((p) => p.role === "member").length,
      guests: active.filter((p) => p.role === "guest").length,
      deactivated: people.length - active.length,
    };
  }, [people]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people.filter(
      (p) =>
        (role === "all" || p.role === role) &&
        (status === "all" || p.status === status) &&
        (!needle ||
          p.full_name.toLowerCase().includes(needle) ||
          p.email.toLowerCase().includes(needle) ||
          (p.title ?? "").toLowerCase().includes(needle)),
    );
  }, [people, q, role, status]);

  const filterTo = (r: typeof role, s: typeof status) => {
    setRole(r);
    setStatus(s);
  };

  const isLastActiveAdmin = (p: Profile) => p.role === "admin" && p.status === "active" && counts.admins <= 1;

  const changeRole = (p: Profile, next: UserRole) => {
    if (next === p.role) return;
    setAccess.mutate(
      { id: p.id, role: next },
      {
        onSuccess: () => toast.success(`${p.full_name || p.email} is now ${ROLE_LABEL[next].toLowerCase()}`),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  const changeStatus = (p: Profile, next: Profile["status"]) => {
    setAccess.mutate(
      { id: p.id, status: next },
      {
        onSuccess: () =>
          toast.success(
            next === "active"
              ? `${p.full_name || p.email} can sign in again`
              : `${p.full_name || p.email} was deactivated and can no longer sign in`,
          ),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  const confirmRemove = () => {
    if (!removing) return;
    const target = removing;
    remove.mutate(target.id, {
      onSuccess: () => {
        toast.success(`${target.full_name || target.email} was removed`);
        setRemoving(null);
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Admins" value={counts.admins} onClick={() => filterTo("admin", "active")} />
        <Stat label="Members" value={counts.members} onClick={() => filterTo("member", "active")} />
        <Stat label="Guests" value={counts.guests} onClick={() => filterTo("guest", "active")} />
        <Stat label="Deactivated" value={counts.deactivated} onClick={() => filterTo("all", "deactivated")} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email or title"
            className="pl-8"
            aria-label="Search people"
          />
        </div>
        <div className="flex gap-2">
          <Select
            aria-label="Filter by role"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="sm:w-36"
          >
            <option value="all">All roles</option>
            <option value="admin">Admins</option>
            <option value="member">Members</option>
            <option value="guest">Guests</option>
          </Select>
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="sm:w-40"
          >
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="deactivated">Deactivated</option>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface scrollbar-thin">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last seen</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const self = p.id === me.id;
              const lastAdmin = isLastActiveAdmin(p);
              return (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar profile={p} size="md" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {p.full_name || p.email}
                          {self && <span className="ml-1.5 text-xs font-normal text-faint">(you)</span>}
                        </div>
                        {p.title && <div className="truncate text-xs text-muted">{p.title}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="max-w-56 truncate px-3 py-2.5 text-muted">{p.email}</td>
                  <td className="px-3 py-2.5">
                    <Tooltip
                      content={
                        self ? "Ask another admin to change your own role" : lastAdmin ? "The last active admin can't be demoted" : null
                      }
                    >
                      <span className="inline-block">
                        <Select
                          aria-label={`Role for ${p.full_name || p.email}`}
                          value={p.role}
                          disabled={self || lastAdmin}
                          onChange={(e) => changeRole(p, e.target.value as UserRole)}
                          className="h-8 w-28 text-[13px]"
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="guest">Guest</option>
                        </Select>
                      </span>
                    </Tooltip>
                  </td>
                  <td className="px-3 py-2.5">
                    {p.status === "active" ? (
                      <Pill className="bg-success-soft text-success">Active</Pill>
                    ) : (
                      <Pill className="bg-surface-3 text-muted">Deactivated</Pill>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                    {p.last_seen_at ? timeAgo(p.last_seen_at) : <span className="text-faint">Never</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted">{format(parseISO(p.created_at), "MMM d, yyyy")}</td>
                  <td className="px-3 py-2.5">
                    {!self && (
                      <Menu>
                        <MenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.full_name || p.email}`}>
                            <MoreHorizontal size={15} />
                          </Button>
                        </MenuTrigger>
                        <MenuContent align="end">
                          {p.status === "active" ? (
                            <MenuItem
                              icon={<UserX size={14} />}
                              disabled={lastAdmin}
                              onSelect={() => changeStatus(p, "deactivated")}
                            >
                              Deactivate
                            </MenuItem>
                          ) : (
                            <MenuItem icon={<UserCheck size={14} />} onSelect={() => changeStatus(p, "active")}>
                              Reactivate
                            </MenuItem>
                          )}
                          <MenuSeparator />
                          <MenuItem
                            danger
                            icon={<Trash2 size={14} />}
                            disabled={lastAdmin}
                            onSelect={() => setRemoving(p)}
                          >
                            Remove user…
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <EmptyState title="No one matches" description="Try a different search or filter." className="py-10" />}
      </div>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.full_name || removing?.email || "user"}?`}
        confirmLabel="Remove user"
        pending={remove.isPending}
        onConfirm={confirmRemove}
        description={
          <div className="space-y-2">
            <p>Their account is deleted permanently. They lose access to every project and team.</p>
            <p>
              Tasks, comments and projects they created <b className="text-text">stay in place</b>; their name is simply
              removed from them. Tasks assigned to them become unassigned.
            </p>
            <p className={cn("rounded-md bg-warning-soft px-2.5 py-2 text-warning")}>
              If their email is on an allowed domain they could sign in again as a new person. To block access but keep
              their history, <b>deactivate</b> them instead.
            </p>
          </div>
        }
      />
    </div>
  );
}

function Stat({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-border bg-surface px-4 py-3 text-left hover:border-border-strong"
    >
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </button>
  );
}
