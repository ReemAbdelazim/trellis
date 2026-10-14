"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, CalendarDays, MoreHorizontal, Plus, Target, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Label, Select, Textarea } from "@/components/ui/input";
import { ColorDot, ConfirmDialog, EmptyState, InlineEdit, PageLoader, StatusPill } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { UserPicker } from "@/components/ui/user-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { ProjectPicker } from "@/components/portfolios/project-picker";
import { useIsAdmin, useIsGuest, useMe } from "@/lib/queries/me";
import { useProfile, useProfileMap, useTeams } from "@/lib/queries/people";
import { useProjects, useProjectStats } from "@/lib/queries/projects";
import {
  formatMetric,
  goalProgress,
  METRIC_UNIT_LABEL,
  PROGRESS_SOURCE_LABEL,
  projectsProgress,
  timePeriodSuggestions,
  useDeleteGoal,
  useDeleteGoalUpdate,
  useGoal,
  useGoalProgressMap,
  useGoals,
  useGoalStatusUpdates,
  useLinkGoalProject,
  usePostGoalUpdate,
  useUpdateGoal,
  type MetricUnit,
  type ProgressSource,
} from "@/lib/queries/goals";
import { cn, errorMessage, timeAgo, toDate } from "@/lib/utils";
import { STATUS_CLASS, STATUS_LABEL, type Goal, type StatusColor } from "@/types/models";
import { CreateGoalDialog } from "./create-goal-dialog";
import { GoalProgress, NumberField } from "./goal-bits";
import { routes } from "@/lib/routes";

export function GoalDetail({ goalId }: { goalId: string }) {
  const isGuest = useIsGuest();
  if (isGuest) {
    return (
      <EmptyState
        icon={<Target size={32} />}
        title="Goals are for members"
        description="Goals are shared with full members of the workspace."
      />
    );
  }
  return <GoalDetailInner goalId={goalId} />;
}

function GoalDetailInner({ goalId }: { goalId: string }) {
  const me = useMe();
  const isAdmin = useIsAdmin();
  const router = useRouter();
  const { data: goal, isLoading } = useGoal(goalId);
  const { data: goals = [] } = useGoals();
  const { ctx } = useGoalProgressMap();
  const update = useUpdateGoal();
  const del = useDeleteGoal();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) return <PageLoader />;
  if (!goal) {
    return (
      <EmptyState
        icon={<Target size={32} />}
        title="Goal not found"
        description="It may have been deleted."
        action={
          <Link href="/goals" className="text-sm text-accent hover:underline">
            Back to goals
          </Link>
        }
      />
    );
  }

  // Use the freshest single-goal row for this goal's own progress.
  const progress = goalProgress(goal, ctx);
  const parent = goals.find((g) => g.id === goal.parent_id);
  const canDelete = isAdmin || goal.created_by === me.id || goal.owner_id === me.id;
  const patch = (p: Partial<Goal>) => update.mutate({ id: goal.id, ...p });

  const remove = async () => {
    try {
      await del.mutateAsync(goal.id);
      toast.success("Goal deleted");
      router.push("/goals");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted">
        <Link href="/goals" className="flex items-center gap-1 hover:text-text">
          <ArrowLeft size={14} /> Goals
        </Link>
        {parent && (
          <>
            <span className="text-faint">/</span>
            <Link href={routes.goal(parent.id)} className="truncate hover:text-text">
              {parent.name}
            </Link>
          </>
        )}
      </div>

      <div className="mb-5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <InlineEdit
            value={goal.name}
            onSave={(name) => patch({ name })}
            className="text-xl font-semibold"
            inputClassName="text-xl font-semibold"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusPill status={goal.status} />
            {goal.time_period && <span className="text-xs text-muted">{goal.time_period}</span>}
          </div>
        </div>
        {canDelete && (
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Goal actions">
                <MoreHorizontal size={16} />
              </Button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem danger icon={<Trash2 size={14} />} onSelect={() => setConfirmDelete(true)}>
                Delete goal
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-6">
          <ProgressCard goal={goal} progress={progress} onPatch={patch} />
          <Description goal={goal} onSave={(description) => patch({ description })} />
          <LinkedProjects goal={goal} linked={ctx.projectsOf.get(goal.id) ?? []} />
          <SubGoals goal={goal} subgoals={ctx.childrenOf.get(goal.id) ?? []} />
          <StatusUpdates goal={goal} />
        </div>
        <aside className="space-y-4">
          <Details goal={goal} goals={goals} onPatch={patch} />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this goal?"
        description="Sub-goals will become top-level goals. Status updates and project links are removed. This can't be undone."
        onConfirm={remove}
        pending={del.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ProgressCard({
  goal,
  progress,
  onPatch,
}: {
  goal: Goal;
  progress: number;
  onPatch: (p: Partial<Goal>) => void;
}) {
  const source = goal.progress_source as ProgressSource;
  return (
    <Card title="Progress">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-3xl font-semibold tabular-nums">{Math.round(progress)}%</span>
        <span className="text-xs text-muted">{PROGRESS_SOURCE_LABEL[source] ?? source}</span>
      </div>
      <GoalProgress value={progress} />
      {source === "manual" && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <Label>Start</Label>
            <NumberField aria-label="Start value" value={goal.metric_start} onCommit={(n) => onPatch({ metric_start: n })} />
          </div>
          <div>
            <Label>Current</Label>
            <NumberField
              aria-label="Current value"
              value={goal.metric_current}
              onCommit={(n) => onPatch({ metric_current: n })}
              className="border-accent"
            />
          </div>
          <div>
            <Label>Target</Label>
            <NumberField aria-label="Target value" value={goal.metric_target} onCommit={(n) => onPatch({ metric_target: n })} />
          </div>
          <p className="col-span-3 text-xs text-muted">
            {formatMetric(goal.metric_current, goal.metric_unit)} of {formatMetric(goal.metric_target, goal.metric_unit)}{" "}
            (started at {formatMetric(goal.metric_start, goal.metric_unit)})
          </p>
        </div>
      )}
    </Card>
  );
}

function Description({ goal, onSave }: { goal: Goal; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(goal.description);
  const [focused, setFocused] = useState(false);
  const [synced, setSynced] = useState(goal.description);
  if (synced !== goal.description && !focused) {
    setSynced(goal.description);
    setDraft(goal.description);
  }
  return (
    <Card title="Description">
      <Textarea
        value={draft}
        rows={3}
        placeholder="Add context: why this goal matters and how it's measured"
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false);
          if (draft !== goal.description) onSave(draft);
        }}
        className="border-transparent hover:border-border"
      />
    </Card>
  );
}

function Details({ goal, goals, onPatch }: { goal: Goal; goals: Goal[]; onPatch: (p: Partial<Goal>) => void }) {
  const owner = useProfile(goal.owner_id);
  const { data: teams = [] } = useTeams();
  const suggestions = timePeriodSuggestions();
  const [period, setPeriod] = useState(goal.time_period);
  const [syncedPeriod, setSyncedPeriod] = useState(goal.time_period);
  if (syncedPeriod !== goal.time_period) {
    setSyncedPeriod(goal.time_period);
    setPeriod(goal.time_period);
  }

  // A goal can't be parented to itself or one of its descendants.
  const blocked = useMemo(() => {
    const out = new Set<string>([goal.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const g of goals) {
        if (g.parent_id && out.has(g.parent_id) && !out.has(g.id)) {
          out.add(g.id);
          grew = true;
        }
      }
    }
    return out;
  }, [goal.id, goals]);

  const start = toDate(goal.start_date);
  const due = toDate(goal.due_date);
  const dateLabel = due
    ? `${start ? `${format(start, "MMM d")} – ` : ""}${format(due, "MMM d, yyyy")}`
    : start
      ? `From ${format(start, "MMM d, yyyy")}`
      : "No dates";

  const field = "flex h-9 w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-left text-sm hover:bg-surface-2";

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <Label>Owner</Label>
        <UserPicker value={goal.owner_id} onChange={(id) => onPatch({ owner_id: id })}>
          <button type="button" className={field}>
            <Avatar profile={owner} size="xs" />
            <span className="truncate">{owner ? owner.full_name || owner.email : "No owner"}</span>
          </button>
        </UserPicker>
      </div>
      <div>
        <Label htmlFor="goal-team">Team</Label>
        <Select id="goal-team" value={goal.team_id ?? ""} onChange={(e) => onPatch({ team_id: e.target.value || null })}>
          <option value="">Company-wide</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="goal-period">Time period</Label>
        <input
          id="goal-period"
          list="goal-detail-periods"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          onBlur={() => period.trim() !== goal.time_period && onPatch({ time_period: period.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder={suggestions[0]}
          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-[var(--ring)] focus:outline-none"
        />
        <datalist id="goal-detail-periods">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <div>
        <Label>Dates</Label>
        <DatePicker
          due={goal.due_date}
          start={goal.start_date}
          onChange={({ due, start }) => onPatch({ due_date: due, start_date: start })}
        >
          <button type="button" className={field}>
            <CalendarDays size={14} className="text-muted" />
            <span className={cn("truncate", !due && !start && "text-faint")}>{dateLabel}</span>
          </button>
        </DatePicker>
      </div>
      <div>
        <Label htmlFor="goal-parent">Parent goal</Label>
        <Select
          id="goal-parent"
          value={goal.parent_id ?? ""}
          onChange={(e) => onPatch({ parent_id: e.target.value || null })}
        >
          <option value="">None (top-level)</option>
          {goals
            .filter((g) => !blocked.has(g.id))
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="goal-source">Measure progress by</Label>
        <Select
          id="goal-source"
          value={goal.progress_source}
          onChange={(e) => onPatch({ progress_source: e.target.value })}
        >
          {(Object.keys(PROGRESS_SOURCE_LABEL) as ProgressSource[]).map((s) => (
            <option key={s} value={s}>
              {PROGRESS_SOURCE_LABEL[s]}
            </option>
          ))}
        </Select>
      </div>
      {goal.progress_source === "manual" && (
        <div>
          <Label htmlFor="goal-unit">Metric</Label>
          <Select id="goal-unit" value={goal.metric_unit} onChange={(e) => onPatch({ metric_unit: e.target.value })}>
            {(Object.keys(METRIC_UNIT_LABEL) as MetricUnit[]).map((u) => (
              <option key={u} value={u}>
                {METRIC_UNIT_LABEL[u]}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}

function LinkedProjects({ goal, linked }: { goal: Goal; linked: string[] }) {
  const { data: projects = [] } = useProjects();
  const { data: stats } = useProjectStats();
  const link = useLinkGoalProject();
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  return (
    <Card
      title="Linked projects"
      action={
        <ProjectPicker exclude={linked} onPick={(projectId) => link.mutate({ goalId: goal.id, projectId, linked: true })} align="end">
          <Button size="xs" variant="ghost">
            <Plus size={13} /> Link project
          </Button>
        </ProjectPicker>
      }
    >
      {goal.progress_source !== "projects" && linked.length > 0 && (
        <p className="mb-2 text-xs text-faint">
          Switch &ldquo;Measure progress by&rdquo; to linked projects to roll these up into this goal.
        </p>
      )}
      {linked.length === 0 ? (
        <p className="text-sm text-faint">No projects linked yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {linked.map((id) => {
            const p = byId.get(id);
            const pct = projectsProgress([id], stats ?? new Map());
            return (
              <li key={id} className="group flex items-center gap-3 py-2">
                <ColorDot color={p?.color} />
                {p ? (
                  <Link href={routes.project(id)} className="min-w-0 flex-1 truncate text-sm hover:underline">
                    {p.name}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm text-faint">Project you can&apos;t access</span>
                )}
                <GoalProgress value={pct} className="w-32 shrink-0 sm:w-40" />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Unlink project"
                  className="opacity-60 group-hover:opacity-100"
                  onClick={() => link.mutate({ goalId: goal.id, projectId: id, linked: false })}
                >
                  <X size={13} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function SubGoals({ goal, subgoals }: { goal: Goal; subgoals: Goal[] }) {
  const { map: progress } = useGoalProgressMap();
  const people = useProfileMap();
  const [open, setOpen] = useState(false);
  return (
    <Card
      title="Sub-goals"
      action={
        <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
          <Plus size={13} /> Add sub-goal
        </Button>
      }
    >
      {subgoals.length === 0 ? (
        <p className="text-sm text-faint">No sub-goals yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {subgoals.map((g) => (
            <li key={g.id} className="flex items-center gap-3 py-2">
              <Avatar profile={g.owner_id ? people.get(g.owner_id) : undefined} size="xs" tooltip />
              <Link href={routes.goal(g.id)} className="min-w-0 flex-1 truncate text-sm hover:underline">
                {g.name}
              </Link>
              <span className="hidden sm:inline">
                <StatusPill status={g.status} />
              </span>
              <GoalProgress value={progress.get(g.id) ?? 0} className="w-32 shrink-0 sm:w-40" />
            </li>
          ))}
        </ul>
      )}
      <CreateGoalDialog
        open={open}
        onOpenChange={setOpen}
        defaultParentId={goal.id}
        defaultTeamId={goal.team_id}
        navigateOnCreate={false}
      />
    </Card>
  );
}

const STATUSES: StatusColor[] = ["on_track", "at_risk", "off_track", "on_hold", "complete"];

function StatusUpdates({ goal }: { goal: Goal }) {
  const me = useMe();
  const isAdmin = useIsAdmin();
  const people = useProfileMap();
  const { data: updates = [], isLoading } = useGoalStatusUpdates(goal.id);
  const post = usePostGoalUpdate(goal.id);
  const del = useDeleteGoalUpdate(goal.id);
  const [status, setStatus] = useState<StatusColor>(goal.status ?? "on_track");
  const [body, setBody] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await post.mutateAsync({ status, body: body.trim(), author_id: me.id });
      setBody("");
      toast.success("Status update posted");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card title="Status updates">
      <form onSubmit={submit} className="mb-4 space-y-2 rounded-md border border-border p-3">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Status">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              onClick={() => setStatus(s)}
              className={cn(
                "h-6 rounded-full px-2.5 text-[11px] font-medium",
                status === s ? cn(STATUS_CLASS[s], "ring-2 ring-[var(--ring)]") : "bg-surface-2 text-muted hover:text-text",
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What's the latest?" />
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={post.isPending}>
            Post update
          </Button>
        </div>
      </form>

      {isLoading ? (
        <PageLoader />
      ) : updates.length === 0 ? (
        <p className="text-sm text-faint">No updates yet.</p>
      ) : (
        <ul className="space-y-4">
          {updates.map((u) => {
            const author = u.author_id ? people.get(u.author_id) : undefined;
            const canDelete = isAdmin || u.author_id === me.id;
            return (
              <li key={u.id} className="group flex gap-3">
                <Avatar profile={author} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{author?.full_name || author?.email || "Someone"}</span>
                    <StatusPill status={u.status} />
                    <span className="text-xs text-faint">{timeAgo(u.created_at)}</span>
                    {canDelete && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete update"
                        className="ml-auto sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                        onClick={() => del.mutate(u.id, { onError: (err) => toast.error(errorMessage(err)) })}
                      >
                        <Trash2 size={13} />
                      </Button>
                    )}
                  </div>
                  {u.body && <p className="mt-1 text-sm whitespace-pre-wrap text-text">{u.body}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
