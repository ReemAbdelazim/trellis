"use client";

import { useMemo } from "react";
import { addDays, addWeeks, differenceInCalendarDays, format, parseISO, startOfWeek } from "date-fns";
import { CircleCheck, CircleDashed, ListTodo, TriangleAlert } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { PageLoader } from "@/components/ui/misc";
import { useProfileMap } from "@/lib/queries/people";
import { useSections } from "@/lib/queries/projects";
import { qk } from "@/lib/queries/keys";
import { useRealtime } from "@/lib/queries/realtime";
import { useProjectTasks } from "@/lib/queries/tasks";
import { cn, toDate } from "@/lib/utils";
import { useToday } from "@/lib/hooks";
import { ChartCard, ColumnChart, EmptyChart, LegendItem, StackedBars, TrendChart } from "../dashboard/charts";

const MAX_PEOPLE = 10;

export function ProjectDashboard({ projectId }: { projectId: string }) {
  const { data: tasks = [], isLoading } = useProjectTasks(projectId);
  const { data: sections = [] } = useSections(projectId);
  const people = useProfileMap();
  const today = useToday();

  useRealtime({ table: "tasks", filter: `project_id=eq.${projectId}`, invalidate: [qk.projectTasks(projectId)] });

  const stats = useMemo(() => {
    const completed = tasks.filter((t) => t.completed);
    const open = tasks.filter((t) => !t.completed);
    const overdue = open.filter((t) => {
      const d = toDate(t.due_date);
      return d && d < today;
    });
    const weekAgo = addDays(today, -7);
    const doneThisWeek = completed.filter((t) => t.completed_at && parseISO(t.completed_at) >= weekAgo).length;

    // Incomplete by section
    const known = new Set(sections.map((s) => s.id));
    const bySection = sections.map((s) => ({
      key: s.id,
      label: s.name,
      value: open.filter((t) => t.section_id === s.id).length,
    }));
    const loose = open.filter((t) => !t.section_id || !known.has(t.section_id)).length;
    if (loose) bySection.unshift({ key: "none", label: "No section", value: loose });

    // By assignee
    const byPerson = new Map<string, { open: number; done: number }>();
    for (const t of tasks) {
      const k = t.assignee_id ?? "";
      const row = byPerson.get(k) ?? { open: 0, done: 0 };
      if (t.completed) row.done++;
      else row.open++;
      byPerson.set(k, row);
    }
    const sortedPeople = [...byPerson.entries()].sort(
      (a, b) => b[1].open - a[1].open || b[1].open + b[1].done - (a[1].open + a[1].done),
    );
    const top = sortedPeople.slice(0, MAX_PEOPLE);
    const rest = sortedPeople.slice(MAX_PEOPLE);
    if (rest.length) {
      top.push([
        "__others",
        rest.reduce((acc, [, v]) => ({ open: acc.open + v.open, done: acc.done + v.done }), { open: 0, done: 0 }),
      ]);
    }

    // Completed per week, last 8 weeks
    const thisWeek = startOfWeek(today);
    const weeks = Array.from({ length: 8 }, (_, i) => addWeeks(thisWeek, i - 7));
    const perWeek = weeks.map((w) => {
      const end = addWeeks(w, 1);
      const value = completed.filter((t) => {
        if (!t.completed_at) return false;
        const d = parseISO(t.completed_at);
        return d >= w && d < end;
      }).length;
      return { key: w.toISOString(), label: format(w, "MMM d"), value, title: `completed week of ${format(w, "MMM d")}` };
    });

    // Upcoming: next 14 days
    const upcoming = Array.from({ length: 14 }, (_, i) => {
      const d = addDays(today, i);
      const value = open.filter((t) => {
        const due = toDate(t.due_date);
        return due && differenceInCalendarDays(due, d) === 0;
      }).length;
      return {
        key: d.toISOString(),
        label: i === 0 ? "Today" : format(d, "EEE"),
        sublabel: format(d, "MMM d"),
        value,
        highlight: i === 0,
        title: `${format(d, "EEEE, MMM d")}: ${value} due`,
      };
    });

    return { completed, open, overdue, doneThisWeek, bySection, top, perWeek, upcoming };
  }, [tasks, sections, today]);

  if (isLoading) return <PageLoader />;

  const total = tasks.length;
  const pct = total ? Math.round((stats.completed.length / total) * 100) : 0;

  const personName = (id: string) =>
    id === "__others" ? "Everyone else" : id ? (people.get(id)?.full_name ?? "Former member") : "Unassigned";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={<ListTodo size={16} />} label="Total tasks" value={total} note={total ? `${pct}% complete` : "No tasks yet"} />
          <StatTile
            icon={<CircleCheck size={16} />}
            label="Completed"
            value={stats.completed.length}
            note={`${stats.doneThisWeek} in the last 7 days`}
          />
          <StatTile icon={<CircleDashed size={16} />} label="Incomplete" value={stats.open.length} note={`${stats.open.filter((t) => !t.due_date).length} without a due date`} />
          <StatTile
            icon={<TriangleAlert size={16} />}
            label="Overdue"
            value={stats.overdue.length}
            note={stats.overdue.length ? "Past their due date" : "Nothing overdue"}
            tone={stats.overdue.length ? "danger" : undefined}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Incomplete tasks by section"
            table={{ columns: ["Section", "Incomplete tasks"], rows: stats.bySection.map((d) => [d.label, d.value]) }}
          >
            {stats.bySection.length ? <ColumnChart data={stats.bySection} minColumn={56} /> : <EmptyChart>No sections yet</EmptyChart>}
          </ChartCard>

          <ChartCard
            title="Tasks by assignee"
            legend={
              <div className="flex gap-3">
                <LegendItem swatch="bg-accent" label="Incomplete" />
                <LegendItem swatch="bg-border-strong" label="Completed" />
              </div>
            }
            table={{
              columns: ["Assignee", "Incomplete", "Completed"],
              rows: stats.top.map(([id, v]) => [personName(id), v.open, v.done]),
            }}
          >
            {stats.top.length ? (
              <StackedBars
                data={stats.top.map(([id, v]) => ({
                  key: id || "unassigned",
                  name: personName(id),
                  open: v.open,
                  done: v.done,
                  label: (
                    <span className="flex min-w-0 items-center gap-2">
                      {id !== "__others" && <Avatar profile={id ? people.get(id) : null} size="xs" />}
                      <span className={cn("truncate", !id && "text-muted")}>{personName(id)}</span>
                    </span>
                  ),
                }))}
              />
            ) : (
              <EmptyChart>No tasks yet</EmptyChart>
            )}
          </ChartCard>

          <ChartCard
            title="Completed per week"
            description="Tasks completed in each of the last 8 weeks"
            table={{ columns: ["Week of", "Completed"], rows: stats.perWeek.map((d) => [d.label, d.value]) }}
          >
            <TrendChart data={stats.perWeek} />
          </ChartCard>

          <ChartCard
            title="Upcoming due dates"
            description="Incomplete tasks due in the next 14 days"
            table={{ columns: ["Day", "Tasks due"], rows: stats.upcoming.map((d) => [d.title.split(":")[0], d.value]) }}
          >
            <ColumnChart data={stats.upcoming} height={150} minColumn={34} />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  note?: string;
  tone?: "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className={cn("flex items-center gap-1.5 text-[12.5px] font-medium text-muted", tone === "danger" && "text-danger")}>
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 text-3xl font-semibold tabular-nums", tone === "danger" && "text-danger")}>{value}</div>
      {note && <div className="mt-0.5 truncate text-xs text-faint">{note}</div>}
    </div>
  );
}
