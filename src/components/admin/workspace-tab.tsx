"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useOrgSettings } from "@/lib/queries/people";
import { useUpdateOrgSettings } from "@/lib/queries/admin";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ConfirmDialog, PageLoader, Spinner } from "@/components/ui/misc";
import { SettingRow, SettingsCard, Switch } from "@/components/settings/switch";
import { errorMessage } from "@/lib/utils";
import type { OrgSettings } from "@/types/models";

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function WorkspaceTab() {
  const { data: org, isLoading } = useOrgSettings();
  if (isLoading || !org) return <PageLoader />;
  // Keyed so local drafts reset if another admin changes the settings.
  return <WorkspaceForm key={org.updated_at} org={org} />;
}

function WorkspaceForm({ org }: { org: OrgSettings }) {
  const me = useMe();
  const update = useUpdateOrgSettings();
  const [name, setName] = useState(org.name);
  const [domain, setDomain] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);

  const myDomain = me.email.split("@")[1]?.toLowerCase() ?? "";
  const domains = org.allowed_domains;

  const save = (patch: Parameters<typeof update.mutate>[0], success: string) =>
    update.mutate(patch, {
      onSuccess: () => toast.success(success),
      onError: (err) => toast.error(errorMessage(err)),
    });

  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    const next = name.trim();
    if (!next || next === org.name) return;
    save({ name: next }, "Workspace name updated");
  };

  const addDomain = (e: React.FormEvent) => {
    e.preventDefault();
    const next = domain.trim().toLowerCase().replace(/^@/, "");
    if (!next) return;
    if (!DOMAIN_RE.test(next)) {
      setDomainError("Enter a domain like seedsofleadership.ca (no @ or https://)");
      return;
    }
    if (domains.some((d) => d.toLowerCase() === next)) {
      setDomainError("That domain is already allowed");
      return;
    }
    setDomainError(null);
    setDomain("");
    save({ allowed_domains: [...domains, next] }, `Anyone with an @${next} email can now sign in`);
  };

  const removeDomain = (d: string) => {
    save({ allowed_domains: domains.filter((x) => x !== d) }, `@${d} removed`);
    setPendingRemoval(null);
  };

  const requestRemoval = (d: string) => {
    if (d.toLowerCase() === myDomain || domains.length === 1) setPendingRemoval(d);
    else removeDomain(d);
  };

  return (
    <div className="space-y-5">
      <SettingsCard title="Organization" description="Shown in the sidebar and in emails.">
        <form onSubmit={saveName} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="org-name">Organization name</Label>
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <Button type="submit" variant="primary" size="md" disabled={!name.trim() || name.trim() === org.name || update.isPending}>
            {update.isPending && <Spinner size={14} className="text-current" />}
            Save
          </Button>
        </form>
      </SettingsCard>

      <SettingsCard
        title="Allowed email domains"
        description="Anyone who signs in with one of these domains joins automatically as a member. Everyone else needs an invitation."
      >
        <div className="py-3">
          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <span
                key={d}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-surface-2 pr-1 pl-3 text-[13px]"
              >
                @{d}
                <button
                  type="button"
                  onClick={() => requestRemoval(d)}
                  className="rounded-full p-0.5 text-muted hover:bg-surface-3 hover:text-danger"
                  aria-label={`Remove ${d}`}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
            {domains.length === 0 && (
              <span className="text-sm text-warning">No domains — only invited people can sign in.</span>
            )}
          </div>
          <form onSubmit={addDomain} className="mt-3 flex gap-2">
            <Input
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setDomainError(null);
              }}
              placeholder="example.org"
              aria-label="New domain"
              aria-invalid={!!domainError}
              className="max-w-xs"
            />
            <Button type="submit" size="md" disabled={!domain.trim()}>
              <Plus size={14} /> Add
            </Button>
          </form>
          {domainError && <p className="mt-1.5 text-xs text-danger">{domainError}</p>}
        </div>
      </SettingsCard>

      <SettingsCard title="Guests">
        <SettingRow
          htmlFor="allow-member-invites"
          title="Members can invite guests"
          description="When off, only admins can invite people from outside your domains."
        >
          <Switch
            id="allow-member-invites"
            checked={org.allow_member_invites}
            onChange={(v) =>
              save({ allow_member_invites: v }, v ? "Members can now invite guests" : "Only admins can invite guests now")
            }
          />
        </SettingRow>
      </SettingsCard>

      <ConfirmDialog
        open={!!pendingRemoval}
        onOpenChange={(o) => !o && setPendingRemoval(null)}
        title={`Remove @${pendingRemoval}?`}
        confirmLabel="Remove domain"
        onConfirm={() => pendingRemoval && removeDomain(pendingRemoval)}
        description={
          <div className="space-y-2">
            {pendingRemoval?.toLowerCase() === myDomain && (
              <p>
                This is <b className="text-text">your own</b> email domain. New colleagues on @{pendingRemoval} will no
                longer be able to join without an invitation.
              </p>
            )}
            {domains.length === 1 && <p>This is the last allowed domain — afterwards only invited people can sign in.</p>}
            <p>People who already have an account keep their access.</p>
          </div>
        }
      />
    </div>
  );
}
