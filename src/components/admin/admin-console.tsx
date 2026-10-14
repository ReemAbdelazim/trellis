"use client";

import { useState } from "react";
import { FileStack, Mail, Settings2, Shield, UserPlus, Users } from "lucide-react";
import { useIsAdmin } from "@/lib/queries/me";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { PeopleTab } from "./people-tab";
import { InvitationsTab } from "./invitations-tab";
import { WorkspaceTab } from "./workspace-tab";
import { EmailTab } from "./email-tab";
import { TemplatesTab } from "./templates-tab";

const TABS = [
  { id: "people", label: "People", icon: <Users size={15} /> },
  { id: "invitations", label: "Invitations", icon: <UserPlus size={15} /> },
  { id: "workspace", label: "Workspace", icon: <Settings2 size={15} /> },
  { id: "email", label: "Email & automation", icon: <Mail size={15} /> },
  { id: "templates", label: "Templates", icon: <FileStack size={15} /> },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AdminConsole() {
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState<TabId>("people");

  if (!isAdmin) {
    return (
      <EmptyState
        icon={<Shield size={32} />}
        title="Admins only"
        description="The admin console is for workspace admins. Ask an admin if you need someone's role or a workspace setting changed."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Shield size={18} />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Admin console</h1>
          <p className="text-sm text-muted">Manage people, invitations and workspace settings.</p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Admin sections"
        className="mb-5 flex gap-1 overflow-x-auto border-b border-border scrollbar-thin"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm whitespace-nowrap",
              tab === t.id ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === "people" && <PeopleTab />}
        {tab === "invitations" && <InvitationsTab />}
        {tab === "workspace" && <WorkspaceTab />}
        {tab === "email" && <EmailTab />}
        {tab === "templates" && <TemplatesTab />}
      </div>
    </div>
  );
}
