"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Home,
  Inbox,
  LayoutGrid,
  Plus,
  Shield,
  Star,
  Target,
  Users,
  BarChart3,
} from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useFavorites, useProjects } from "@/lib/queries/projects";
import { useTeamMembers, useTeams } from "@/lib/queries/people";
import { useUnreadCount } from "@/lib/queries/notifications";
import { useMyProjectIds } from "@/lib/queries/home";
import { cn, colorHex } from "@/lib/utils";
import { Logo } from "./logo";
import { CreateProjectDialog } from "@/components/project/create-project-dialog";
import { routes } from "@/lib/routes";

function NavLink({
  href,
  icon,
  children,
  badge,
  exact,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  badge?: number;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] text-sidebar-text/90 transition-colors hover:bg-sidebar-hover",
        active && "bg-sidebar-active text-sidebar-text",
      )}
    >
      <span className="flex w-4 justify-center text-sidebar-muted">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {!!badge && (
        <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] leading-5 font-semibold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function Group({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-5">
      <div className="group flex items-center px-2.5 pb-1">
        <button
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-center gap-1 text-[12px] font-semibold text-sidebar-muted hover:text-sidebar-text"
        >
          {title}
          <ChevronDown size={12} className={cn("transition-transform", !open && "-rotate-90")} />
        </button>
        {action}
      </div>
      {open && <div className="space-y-px">{children}</div>}
    </div>
  );
}

export function Sidebar() {
  const me = useMe();
  const isGuest = me.role === "guest";
  const { data: unread } = useUnreadCount(me.id);
  const { data: projects = [] } = useProjects();
  const { data: favorites = [] } = useFavorites();
  const { data: teams = [] } = useTeams();
  const { data: teamMembers = [] } = useTeamMembers();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: myProjectIds = [] } = useMyProjectIds(me.id);

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const favProjects = favorites.map((id) => byId.get(id)).filter((p) => p && !p.archived);
  const myProjects = projects
    .filter((p) => !p.archived && !p.is_template && myProjectIds.includes(p.id) && !favorites.includes(p.id))
    .slice(0, 30);
  const myTeams = teams.filter((t) => teamMembers.some((m) => m.team_id === t.id && m.user_id === me.id));

  const projectLink = (p: (typeof projects)[number]) => (
    <NavLink
      key={p.id}
      href={routes.project(p.id)}
      icon={<span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorHex(p.color) }} />}
    >
      {p.name}
    </NavLink>
  );

  return (
    <nav className="flex h-full flex-col bg-sidebar text-sidebar-text">
      <div className="flex h-12 shrink-0 items-center gap-2 px-4">
        <Logo size={24} />
        <span className="text-[15px] font-semibold tracking-tight">Seeds Tasks</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin">
        <div className="space-y-px">
          <NavLink href="/home" icon={<Home size={15} />}>
            Home
          </NavLink>
          <NavLink href="/my-tasks" icon={<CheckCircle2 size={15} />}>
            My tasks
          </NavLink>
          <NavLink href="/inbox" icon={<Inbox size={15} />} badge={unread}>
            Inbox
          </NavLink>
        </div>

        {!isGuest && (
          <Group title="Insights">
            <NavLink href="/goals" icon={<Target size={15} />}>
              Goals
            </NavLink>
            <NavLink href="/portfolios" icon={<Briefcase size={15} />}>
              Portfolios
            </NavLink>
            <NavLink href="/workload" icon={<BarChart3 size={15} />}>
              Workload
            </NavLink>
          </Group>
        )}

        {favProjects.length > 0 && (
          <Group title="Favorites">{favProjects.map((p) => projectLink(p!))}</Group>
        )}

        <Group
          title="Projects"
          action={
            !isGuest && (
              <button
                onClick={() => setCreateOpen(true)}
                aria-label="New project"
                className="rounded p-0.5 text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-text"
              >
                <Plus size={14} />
              </button>
            )
          }
        >
          {myProjects.map(projectLink)}
          <NavLink href="/projects" icon={<LayoutGrid size={15} />} exact>
            Browse projects
          </NavLink>
        </Group>

        {!isGuest && (
          <Group title="Teams">
            {myTeams.map((t) => (
              <NavLink key={t.id} href={routes.team(t.id)} icon={<Users size={15} />}>
                {t.name}
              </NavLink>
            ))}
            <NavLink href="/teams" icon={<Star size={15} />} exact>
              All teams
            </NavLink>
          </Group>
        )}

        {me.role === "admin" && (
          <Group title="Workspace">
            <NavLink href="/admin" icon={<Shield size={15} />}>
              Admin console
            </NavLink>
          </Group>
        )}
      </div>
      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </nav>
  );
}
