"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/queries/keys";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { useMe } from "@/lib/queries/me";
import { useOrgSettings } from "@/lib/queries/people";
import { useProjects } from "@/lib/queries/projects";
import { errorMessage } from "@/lib/utils";
import { sendInvitation } from "@/lib/functions";
import type { UserRole } from "@/types/models";

/**
 * Invite someone by email. Seeds-domain people don't need an invite — they can
 * just sign in. Outside people become guests (admins may invite members/admins).
 */
export function InviteDialog({
  open,
  onOpenChange,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultProjectId?: string;
}) {
  const me = useMe();
  const { data: org } = useOrgSettings();
  const { data: projects = [] } = useProjects();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("guest");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [pending, setPending] = useState(false);
  const qc = useQueryClient();

  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const isOrgDomain = !!domain && (org?.allowed_domains ?? []).some((d) => d.toLowerCase() === domain);
  const isAdmin = me.role === "admin";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const result = await sendInvitation({
        email: email.trim(),
        role: isAdmin ? role : "guest",
        projectId: projectId || null,
      });
      qc.invalidateQueries({ queryKey: qk.invitations });
      toast.success(result.emailed ? `Invitation emailed to ${email}` : `Invitation saved — ask ${email} to sign in`);
      setEmail("");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite people"
      description="Anyone with a Seeds email can already sign in. Invite outside partners as guests."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="invite-form" disabled={!email.includes("@") || pending}>
            {pending && <Spinner size={14} className="text-current" />}
            Send invite
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@partner.org"
          />
          {isOrgDomain && (
            <p className="mt-1.5 text-xs text-muted">
              {domain} is a Seeds domain — they can sign in right away. An invite still adds them to the project below.
            </p>
          )}
        </div>
        {isAdmin && (
          <div>
            <Label htmlFor="invite-role">Role</Label>
            <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="guest">Guest — only sees projects and tasks shared with them</option>
              <option value="member">Member — full workspace access</option>
              <option value="admin">Admin — manages people and settings</option>
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="invite-project">Add to project (optional)</Label>
          <Select id="invite-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">None</option>
            {projects
              .filter((p) => !p.archived && !p.is_template)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </div>
      </form>
    </Dialog>
  );
}
