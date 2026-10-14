"use client";

import { format, parseISO } from "date-fns";
import { CalendarRange, Diamond, Globe, Lock, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { DatePicker } from "@/components/ui/date-picker";
import { ProgressBar } from "@/components/ui/misc";
import { TaskCheckbox } from "@/components/task/task-bits";
import { useProfileMap, useTeams } from "@/lib/queries/people";
import { useProjectMembers, useUpdateProject } from "@/lib/queries/projects";
import type { TaskItem } from "@/lib/queries/tasks";
import { cn, DUE_TONE_CLASS, dueTone, formatDateRange, formatDue, toDate } from "@/lib/utils";
import type { Project, ProjectRole } from "@/types/models";

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Owner",
  editor: "Editor",
  commenter: "Commenter",
  viewer: "Viewer",
};

const PRIVACY = {
  public: { icon: Globe, label: "Workspace", note: "Everyone in the workspace can find and edit it" },
  team: { icon: Users, label: "Team", note: "Members of the team can edit it" },
  private: { icon: Lock, label: "Private", note: "Only invited members can see it" },
} as const;

export function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-surface p-4 shadow-card", className)}>
      <h2 className="mb-3 text-[14px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function ProgressPanel({ tasks }: { tasks: TaskItem[] }) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <Panel title="Progress">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums">{pct}%</span>
        <span className="text-xs text-muted">
          {done} of {total} {total === 1 ? "task" : "tasks"} complete
        </span>
      </div>
      <ProgressBar value={pct} className="mt-2 h-2" />
    </Panel>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 py-1.5 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function DetailsPanel({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const people = useProfileMap();
  const { data: teams = [] } = useTeams();
  const update = useUpdateProject();
  const owner = project.owner_id ? people.get(project.owner_id) : undefined;
  const team = teams.find((t) => t.id === project.team_id);
  const privacy = PRIVACY[project.privacy];
  const dates = formatDateRange(project.start_date, project.due_date);

  return (
    <Panel title="Key details">
      <dl>
        <Detail label="Owner">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar profile={owner} size="xs" />
            <span className={cn("truncate", !owner && "text-faint")}>{owner?.full_name ?? "No owner"}</span>
          </span>
        </Detail>
        <Detail label="Dates">
          <DatePicker
            due={project.due_date}
            start={project.start_date}
            disabled={!canEdit}
            onChange={({ due, start }) => update.mutate({ id: project.id, due_date: due, start_date: start })}
          >
            <button
              type="button"
              disabled={!canEdit}
              className={cn(
                "-mx-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-left",
                canEdit && "hover:bg-surface-2",
                !dates && "text-faint",
              )}
            >
              <CalendarRange size={14} className="shrink-0 text-faint" />
              {dates || (canEdit ? "Set dates" : "No dates")}
            </button>
          </DatePicker>
        </Detail>
        <Detail label="Team">
          <span className={cn("truncate", !team && "text-faint")}>{team?.name ?? "No team"}</span>
        </Detail>
        <Detail label="Privacy">
          <span className="flex items-center gap-1.5" title={privacy.note}>
            <privacy.icon size={14} className="text-faint" />
            {privacy.label}
          </span>
        </Detail>
        <Detail label="Created">{format(parseISO(project.created_at), "MMM d, yyyy")}</Detail>
      </dl>
    </Panel>
  );
}

export function MembersPanel({ project }: { project: Project }) {
  const { data: members = [] } = useProjectMembers(project.id);
  const people = useProfileMap();
  const order: Record<ProjectRole, number> = { owner: 0, editor: 1, commenter: 2, viewer: 3 };
  const sorted = [...members].sort(
    (a, b) =>
      order[a.role] - order[b.role] ||
      (people.get(a.user_id)?.full_name ?? "").localeCompare(people.get(b.user_id)?.full_name ?? ""),
  );
  return (
    <Panel title={`Members (${members.length})`}>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted">No one has been added directly yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((m) => {
            const p = people.get(m.user_id);
            return (
              <li key={m.user_id} className="flex items-center gap-2 text-[13px]">
                <Avatar profile={p} size="sm" />
                <span className="min-w-0 flex-1 truncate">{p?.full_name || p?.email || "Former member"}</span>
                <span className="text-xs text-muted">{ROLE_LABEL[m.role]}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-faint">
        {project.privacy !== "private" && `${PRIVACY[project.privacy].note}. `}
        Use <span className="font-medium text-muted">Share</span> at the top of the project to manage members.
      </p>
    </Panel>
  );
}

export function MilestonesPanel({
  tasks,
  canEdit,
  onOpen,
}: {
  tasks: TaskItem[];
  canEdit: boolean;
  onOpen: (id: string) => void;
}) {
  const milestones = tasks
    .filter((t) => t.is_milestone)
    .sort((a, b) => {
      const da = toDate(a.due_date ?? a.start_date)?.getTime() ?? Infinity;
      const db = toDate(b.due_date ?? b.start_date)?.getTime() ?? Infinity;
      return da - db || a.position - b.position;
    });
  const done = milestones.filter((m) => m.completed).length;

  return (
    <section aria-labelledby="milestones-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="milestones-heading" className="text-[15px] font-semibold">
          Milestones
        </h2>
        {milestones.length > 0 && (
          <span className="text-xs text-muted">
            {done} of {milestones.length} reached
          </span>
        )}
      </div>
      {milestones.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted">
          <Diamond size={18} className="shrink-0 text-faint" />
          No milestones yet. Mark key tasks as milestones from the task details pane to track them here.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface shadow-card">
          {milestones.map((m) => {
            const tone = dueTone(m.due_date, m.completed);
            return (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                <TaskCheckbox task={m} disabled={!canEdit} />
                <button
                  type="button"
                  onClick={() => onOpen(m.id)}
                  className={cn("min-w-0 flex-1 truncate text-left text-[13.5px] hover:underline", m.completed && "text-faint line-through")}
                >
                  {m.name || "Untitled milestone"}
                </button>
                <span className={cn("shrink-0 text-xs", m.due_date ? DUE_TONE_CLASS[tone] : "text-faint")}>
                  {m.due_date ? formatDue(m.due_date) : "No date"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
