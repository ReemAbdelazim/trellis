"use client";

import { useMemo, useState } from "react";
import { addDays, addWeeks, eachDayOfInterval, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, Clock, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/misc";
import { NumberField } from "@/components/goals/goal-bits";
import { useIsGuest } from "@/lib/queries/me";
import { useActiveProfiles, useProfileMap, useTeamMembers, useTeams } from "@/lib/queries/people";
import { useProjects } from "@/lib/queries/projects";
import { usePortfolios } from "@/lib/queries/portfolios";
import { useTasksInRange } from "@/lib/queries/workload";
import { useRealtime } from "@/lib/queries/realtime";
import { useLocalFlag } from "@/lib/use-local-flag";
import { cn, toISODate } from "@/lib/utils";
import { buildWorkload, UNASSIGNED } from "./workload-model";
import { WorkloadGrid, type WorkloadRow } from "./workload-grid";
import { useLocalNumber } from "./use-local-number";

const RANGE_KEY = ["tasks", "range"] as const;

export function WorkloadView() {
  const isGuest = useIsGuest();
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [weeks, setWeeks] = useLocalNumber("seeds-workload-weeks", 2, 2, 4);
  const [effort, setEffort] = useLocalFlag("seeds-workload-effort");
  const [capTasks, setCapTasks] = useLocalNumber("seeds-workload-cap-tasks", 5, 1, 100);
  const [capHours, setCapHours] = useLocalNumber("seeds-workload-cap-hours", 8, 1, 24);
  const [scope, setScope] = useState("everyone");

  const span = weeks === 4 ? 4 : 2;
  const days = useMemo(
    () => eachDayOfInterval({ start: anchor, end: addDays(anchor, span * 7 - 1) }).map((d) => toISODate(d)!),
    [anchor, span],
  );
  const start = days[0];
  const end = days[days.length - 1];

  const { data: tasks = [], isLoading } = useTasksInRange(start, end);
  const { data: profiles = [] } = useActiveProfiles();
  const profileMap = useProfileMap();
  const { data: teams = [] } = useTeams();
  const { data: teamMembers = [] } = useTeamMembers();
  const { data: projects = [] } = useProjects();
  const { data: portfolios = [] } = usePortfolios(!isGuest);

  useRealtime({ table: "tasks", invalidate: [RANGE_KEY] });

  // Resolve the scope into: which people are rows, and which tasks count.
  const { people, scopedTasks } = useMemo(() => {
    const [kind, id] = scope.split(":");
    const open = tasks.filter((t) => !t.completed);
    if (kind === "team" && id) {
      const memberIds = new Set(teamMembers.filter((m) => m.team_id === id).map((m) => m.user_id));
      const teamProjects = new Set(projects.filter((p) => p.team_id === id).map((p) => p.id));
      return {
        people: [...memberIds],
        scopedTasks: open.filter((t) =>
          t.assignee_id ? memberIds.has(t.assignee_id) : !!t.project_id && teamProjects.has(t.project_id),
        ),
      };
    }
    if (kind === "portfolio" && id) {
      const portfolio = portfolios.find((p) => p.id === id);
      const projectIds = new Set(portfolio?.projects.map((p) => p.project_id) ?? []);
      const scoped = open.filter((t) => !!t.project_id && projectIds.has(t.project_id));
      const ids = new Set<string>();
      if (portfolio?.owner_id) ids.add(portfolio.owner_id);
      portfolio?.members.forEach((m) => ids.add(m.user_id));
      scoped.forEach((t) => t.assignee_id && ids.add(t.assignee_id));
      return { people: [...ids], scopedTasks: scoped };
    }
    // Everyone: all full members, plus anyone (e.g. guests) with work in the window.
    const ids = new Set(profiles.filter((p) => p.role !== "guest").map((p) => p.id));
    open.forEach((t) => t.assignee_id && ids.add(t.assignee_id));
    return { people: [...ids], scopedTasks: open };
  }, [scope, tasks, teamMembers, projects, portfolios, profiles]);

  const grid = useMemo(() => buildWorkload(scopedTasks, days, effort), [scopedTasks, days, effort]);

  const rows: WorkloadRow[] = useMemo(() => {
    const list: WorkloadRow[] = people
      .map((id) => ({ key: id, profile: profileMap.get(id) }))
      .sort((a, b) =>
        (a.profile?.full_name || a.profile?.email || "~").localeCompare(b.profile?.full_name || b.profile?.email || "~"),
      );
    list.push({ key: UNASSIGNED, profile: undefined });
    return list;
  }, [people, profileMap]);

  const capacity = effort ? capHours : capTasks;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border bg-surface px-4 py-3 md:px-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Workload</h1>
            <p className="text-sm text-muted">
              {effort ? "Estimated hours" : "Incomplete tasks due"} per person per day, against capacity.
            </p>
          </div>
          <span className="text-sm text-muted">
            {format(anchor, "MMM d")} – {format(addDays(anchor, span * 7 - 1), "MMM d, yyyy")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" aria-label="Previous period" onClick={() => setAnchor((a) => addWeeks(a, -span))}>
              <ChevronLeft size={16} />
            </Button>
            <Button size="sm" onClick={() => setAnchor(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
              Today
            </Button>
            <Button size="icon" variant="ghost" aria-label="Next period" onClick={() => setAnchor((a) => addWeeks(a, span))}>
              <ChevronRight size={16} />
            </Button>
          </div>
          <Segmented
            value={String(span)}
            onChange={(v) => setWeeks(Number(v))}
            options={[
              { value: "2", label: "2 weeks" },
              { value: "4", label: "4 weeks" },
            ]}
          />
          <Segmented
            value={effort ? "effort" : "count"}
            onChange={(v) => setEffort(v === "effort")}
            options={[
              { value: "count", label: "Tasks", icon: <ListChecks size={13} /> },
              { value: "effort", label: "Effort", icon: <Clock size={13} /> },
            ]}
          />
          <Select
            aria-label="Who to show"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="h-8 w-auto max-w-[220px] text-[13px]"
          >
            <option value="everyone">Everyone</option>
            {teams.length > 0 && (
              <optgroup label="Teams">
                {teams.map((t) => (
                  <option key={t.id} value={`team:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
            {portfolios.length > 0 && (
              <optgroup label="Portfolios">
                {portfolios.map((p) => (
                  <option key={p.id} value={`portfolio:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            Capacity
            <NumberField
              key={effort ? "h" : "t"}
              aria-label="Capacity per day"
              value={capacity}
              onCommit={(n) => {
                if (n <= 0) return;
                if (effort) setCapHours(n);
                else setCapTasks(n);
              }}
              className="w-16"
            />
            {effort ? "h/day" : "tasks/day"}
          </label>
          <Legend />
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3 md:p-4">
        {isLoading ? (
          <PageLoader />
        ) : (
          <WorkloadGrid rows={rows} days={days} grid={grid} capacity={capacity} effort={effort} tasks={scopedTasks} />
        )}
      </div>
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="flex rounded-md border border-border bg-surface p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-6 items-center gap-1 rounded px-2 text-[12.5px]",
            value === o.value ? "bg-surface-3 font-medium text-text" : "text-muted hover:text-text",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="ml-auto hidden items-center gap-2 text-[11px] text-muted lg:flex">
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm bg-accent/15" /> Light
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm bg-accent/55" /> Near capacity
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm bg-danger/25" /> Over
      </span>
    </div>
  );
}
