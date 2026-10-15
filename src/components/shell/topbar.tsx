"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckSquare, FolderPlus, LogOut, Menu as MenuIcon, PanelLeft, Plus, Search, Settings, Shield, Target, UserPlus, UserRound } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { CreateProjectDialog } from "@/components/project/create-project-dialog";
import { QuickAddTaskDialog } from "@/components/task/quick-add-dialog";
import { InviteDialog } from "@/components/shell/invite-dialog";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import { routes } from "@/lib/routes";

export function Topbar({
  onOpenNav,
  onToggleSidebar,
  onOpenSearch,
}: {
  onOpenNav: () => void;
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
}) {
  const me = useMe();
  const router = useRouter();
  const [projectOpen, setProjectOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const isGuest = me.role === "guest";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenNav} aria-label="Open navigation">
        <MenuIcon size={17} />
      </Button>
      <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={onToggleSidebar} aria-label="Toggle sidebar">
        <PanelLeft size={17} />
      </Button>

      <Menu>
        <MenuTrigger asChild>
          <Button variant="primary" size="sm" className="rounded-full">
            <Plus size={15} /> <span className="hidden sm:inline">Create</span>
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem icon={<CheckSquare size={15} />} onSelect={() => setTaskOpen(true)}>
            Task
          </MenuItem>
          {!isGuest && (
            <>
              <MenuItem icon={<FolderPlus size={15} />} onSelect={() => setProjectOpen(true)}>
                Project
              </MenuItem>
              <MenuItem icon={<Target size={15} />} onSelect={() => router.push("/goals?new=1")}>
                Goal
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<UserPlus size={15} />} onSelect={() => setInviteOpen(true)}>
                Invite
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>

      <button
        onClick={onOpenSearch}
        className="mx-auto flex h-8 w-full min-w-0 max-w-md items-center gap-2 rounded-full border border-border bg-surface-2 px-3 text-left text-[13px] text-faint hover:border-border-strong"
      >
        <Search size={14} />
        <span className="flex-1 truncate">Search tasks, projects, people…</span>
        <span className="hidden sm:inline">
          <Kbd>Ctrl K</Kbd>
        </span>
      </button>

      <Menu>
        <MenuTrigger asChild>
          <button className="shrink-0 rounded-full" aria-label="Account menu">
            <Avatar profile={me} size="md" />
          </button>
        </MenuTrigger>
        <MenuContent align="end" className="w-64">
          <MenuItem asChild className="h-auto gap-3 py-2.5">
            <Link href={routes.settingsTab("profile")}>
              <Avatar profile={me} size="lg" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{me.full_name}</div>
                <div className="truncate text-xs text-faint">{me.email}</div>
              </div>
            </Link>
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<UserRound size={15} />} asChild>
            <Link href={routes.settingsTab("profile")}>Profile</Link>
          </MenuItem>
          <MenuItem icon={<Settings size={15} />} asChild>
            <Link href={routes.settings}>Settings</Link>
          </MenuItem>
          {me.role === "admin" && (
            <MenuItem icon={<Shield size={15} />} asChild>
              <Link href={routes.admin}>Admin console</Link>
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem icon={<LogOut size={15} />} onSelect={() => signOut()}>
            Sign out
          </MenuItem>
        </MenuContent>
      </Menu>

      <CreateProjectDialog open={projectOpen} onOpenChange={setProjectOpen} />
      <QuickAddTaskDialog open={taskOpen} onOpenChange={setTaskOpen} />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </header>
  );
}
