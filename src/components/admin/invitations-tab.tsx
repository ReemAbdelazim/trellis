"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ChevronRight, MailCheck, Send, UserPlus, X } from "lucide-react";
import { qk } from "@/lib/queries/keys";
import { useProfileMap } from "@/lib/queries/people";
import { useProjects } from "@/lib/queries/projects";
import { useEmailStatus, useInvitations, useRevokeInvitation } from "@/lib/queries/admin";
import { callFunction } from "@/lib/functions";
import { InviteDialog } from "@/components/shell/invite-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, EmptyState, PageLoader, Pill, Spinner } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { errorMessage, timeAgo } from "@/lib/utils";
import type { Invitation, UserRole } from "@/types/models";

const ROLE_CLASS: Record<UserRole, string> = {
  admin: "bg-accent-soft text-accent",
  member: "bg-info-soft text-info",
  guest: "bg-surface-3 text-muted",
};

export function InvitationsTab() {
  const qc = useQueryClient();
  const { data: invitations = [], isLoading } = useInvitations();
  const { data: emailStatus } = useEmailStatus();
  const { data: projects = [] } = useProjects();
  const people = useProfileMap();
  const revoke = useRevokeInvitation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const open = invitations.filter((i) => !i.accepted_at);
  const accepted = invitations
    .filter((i) => i.accepted_at)
    .sort((a, b) => (b.accepted_at ?? "").localeCompare(a.accepted_at ?? ""));

  const resend = async (inv: Invitation) => {
    setResending(inv.id);
    try {
      await callFunction("admin", { action: "resend-invite", invitationId: inv.id });
      toast.success(`Invitation re-sent to ${inv.email}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setResending(null);
    }
  };

  const confirmRevoke = () => {
    if (!revoking) return;
    const inv = revoking;
    revoke.mutate(inv.id, {
      onSuccess: () => {
        toast.success(`Invitation for ${inv.email} revoked`);
        setRevoking(null);
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Open invitations</h2>
          <p className="text-xs text-muted">
            People on an allowed email domain don&apos;t need an invitation — they can sign in directly.
          </p>
        </div>
        <Button variant="primary" onClick={() => setInviteOpen(true)}>
          <UserPlus size={15} /> Invite people
        </Button>
      </div>

      {emailStatus && !emailStatus.emailConfigured && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          Email delivery isn&apos;t configured, so invitations are saved but not emailed. Tell invitees to sign in at
          the app address with the invited email.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface scrollbar-thin">
        {open.length === 0 ? (
          <EmptyState
            icon={<MailCheck size={28} />}
            title="No open invitations"
            description="Invite outside partners as guests, or add people to a project."
            className="py-10"
          />
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Invited by</th>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Sent</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {open.map((inv) => {
                const inviter = inv.invited_by ? people.get(inv.invited_by) : undefined;
                return (
                  <tr key={inv.id} className="border-b border-border last:border-0">
                    <td className="max-w-64 truncate px-4 py-2.5 font-medium">{inv.email}</td>
                    <td className="px-3 py-2.5">
                      <Pill className={ROLE_CLASS[inv.role]}>{inv.role}</Pill>
                    </td>
                    <td className="px-3 py-2.5">
                      {inviter ? (
                        <span className="flex items-center gap-1.5">
                          <Avatar profile={inviter} size="xs" />
                          <span className="truncate">{inviter.full_name || inviter.email}</span>
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="max-w-48 truncate px-3 py-2.5 text-muted">
                      {inv.project_id ? (projectNames.get(inv.project_id) ?? "Private project") : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                      <Tooltip content={format(parseISO(inv.created_at), "PPpp")}>
                        <span>{timeAgo(inv.created_at)}</span>
                      </Tooltip>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={resending === inv.id || !emailStatus?.emailConfigured}
                          onClick={() => resend(inv)}
                        >
                          {resending === inv.id ? <Spinner size={12} className="text-current" /> : <Send size={12} />}
                          Resend
                        </Button>
                        <Button size="xs" variant="ghost" className="hover:text-danger" onClick={() => setRevoking(inv)}>
                          <X size={12} /> Revoke
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {accepted.length > 0 && (
        <details className="group rounded-xl border border-border bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium select-none">
            <ChevronRight size={15} className="text-muted transition-transform group-open:rotate-90" />
            Accepted invitations
            <span className="text-xs font-normal text-faint">{accepted.length}</span>
          </summary>
          <div className="overflow-x-auto border-t border-border scrollbar-thin">
            <table className="w-full min-w-[600px] text-sm">
              <tbody>
                {accepted.map((inv) => {
                  const inviter = inv.invited_by ? people.get(inv.invited_by) : undefined;
                  return (
                    <tr key={inv.id} className="border-b border-border last:border-0">
                      <td className="max-w-64 truncate px-4 py-2">{inv.email}</td>
                      <td className="px-3 py-2">
                        <Pill className={ROLE_CLASS[inv.role]}>{inv.role}</Pill>
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {inviter ? `by ${inviter.full_name || inviter.email}` : ""}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted">
                        Joined {format(parseISO(inv.accepted_at!), "MMM d, yyyy")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={(o) => {
          setInviteOpen(o);
          if (!o) qc.invalidateQueries({ queryKey: qk.invitations });
        }}
      />

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke invitation?"
        confirmLabel="Revoke"
        pending={revoke.isPending}
        onConfirm={confirmRevoke}
        description={
          <>
            <b className="text-text">{revoking?.email}</b> won&apos;t be able to sign in with this invitation. You can
            invite them again later.
          </>
        }
      />
    </div>
  );
}
