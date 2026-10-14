"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/avatar";
import { UserPicker } from "@/components/ui/user-picker";
import { DatePicker } from "@/components/ui/date-picker";
import { useMe } from "@/lib/queries/me";
import { useProfile, useTeams } from "@/lib/queries/people";
import {
  METRIC_UNIT_LABEL,
  PROGRESS_SOURCE_LABEL,
  timePeriodSuggestions,
  useCreateGoal,
  useGoals,
  type MetricUnit,
  type ProgressSource,
} from "@/lib/queries/goals";
import { errorMessage, toDate } from "@/lib/utils";
import { routes } from "@/lib/routes";

export function CreateGoalDialog({
  open,
  onOpenChange,
  defaultParentId,
  defaultTeamId,
  navigateOnCreate = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultParentId?: string | null;
  defaultTeamId?: string | null;
  /** Open the new goal's page after creating it. */
  navigateOnCreate?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New goal" className="max-w-xl">
      {/* Remount per open so fields reset without effects. */}
      {open && (
        <CreateGoalForm
          onDone={() => onOpenChange(false)}
          defaultParentId={defaultParentId ?? null}
          defaultTeamId={defaultTeamId ?? null}
          navigateOnCreate={navigateOnCreate}
        />
      )}
    </Dialog>
  );
}

function CreateGoalForm({
  onDone,
  defaultParentId,
  defaultTeamId,
  navigateOnCreate,
}: {
  onDone: () => void;
  defaultParentId: string | null;
  defaultTeamId: string | null;
  navigateOnCreate: boolean;
}) {
  const me = useMe();
  const router = useRouter();
  const { data: teams = [] } = useTeams();
  const { data: goals = [] } = useGoals();
  const create = useCreateGoal();
  const parentDefault = goals.find((g) => g.id === defaultParentId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(me.id);
  const [teamId, setTeamId] = useState(defaultTeamId ?? parentDefault?.team_id ?? "");
  const [period, setPeriod] = useState(parentDefault?.time_period ?? "");
  const [dates, setDates] = useState<{ start: string | null; due: string | null }>({ start: null, due: null });
  const [parentId, setParentId] = useState(defaultParentId ?? "");
  const [source, setSource] = useState<ProgressSource>("manual");
  const [unit, setUnit] = useState<MetricUnit>("percent");
  const [metricStart, setMetricStart] = useState("0");
  const [metricTarget, setMetricTarget] = useState("100");
  const owner = useProfile(ownerId);
  const suggestions = timePeriodSuggestions();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const start = Number(metricStart) || 0;
    const target = Number(metricTarget);
    try {
      const goal = await create.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        owner_id: ownerId,
        team_id: teamId || null,
        parent_id: parentId || null,
        time_period: period.trim(),
        start_date: dates.start,
        due_date: dates.due,
        progress_source: source,
        metric_unit: unit,
        metric_start: start,
        metric_current: start,
        metric_target: Number.isFinite(target) ? target : 100,
        created_by: me.id,
      });
      onDone();
      if (navigateOnCreate) router.push(routes.goal(goal.id));
      else toast.success("Goal created");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const dueLabel = dates.due
    ? `${dates.start ? `${format(toDate(dates.start)!, "MMM d")} – ` : ""}${format(toDate(dates.due)!, "MMM d, yyyy")}`
    : "No due date";

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="goal-name">Goal name</Label>
        <Input
          id="goal-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Reach 500 youth leaders"
        />
      </div>
      <div>
        <Label htmlFor="goal-desc">Description</Label>
        <Textarea
          id="goal-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why this matters and how we'll measure it"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Owner</Label>
          <UserPicker value={ownerId} onChange={setOwnerId}>
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-left text-sm hover:bg-surface-2"
            >
              <Avatar profile={owner} size="xs" />
              <span className="truncate">{owner ? owner.full_name || owner.email : "No owner"}</span>
            </button>
          </UserPicker>
        </div>
        <div>
          <Label htmlFor="goal-team">Team</Label>
          <Select id="goal-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
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
          <Input
            id="goal-period"
            list="goal-period-suggestions"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder={suggestions[0]}
          />
          <datalist id="goal-period-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div>
          <Label>Dates</Label>
          <DatePicker due={dates.due} start={dates.start} onChange={setDates}>
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-left text-sm hover:bg-surface-2"
            >
              <CalendarDays size={14} className="text-muted" />
              <span className={dates.due ? "" : "text-faint"}>{dueLabel}</span>
            </button>
          </DatePicker>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="goal-parent">Parent goal</Label>
          <Select id="goal-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">None (top-level goal)</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="goal-source">Measure progress by</Label>
            <Select id="goal-source" value={source} onChange={(e) => setSource(e.target.value as ProgressSource)}>
              {(Object.keys(PROGRESS_SOURCE_LABEL) as ProgressSource[]).map((s) => (
                <option key={s} value={s}>
                  {PROGRESS_SOURCE_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          {source === "manual" && (
            <>
              <div className="sm:col-span-2">
                <Label htmlFor="goal-unit">Metric</Label>
                <Select id="goal-unit" value={unit} onChange={(e) => setUnit(e.target.value as MetricUnit)}>
                  {(Object.keys(METRIC_UNIT_LABEL) as MetricUnit[]).map((u) => (
                    <option key={u} value={u}>
                      {METRIC_UNIT_LABEL[u]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="goal-start">Start value</Label>
                <Input
                  id="goal-start"
                  type="number"
                  step="any"
                  value={metricStart}
                  onChange={(e) => setMetricStart(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="goal-target">Target value</Label>
                <Input
                  id="goal-target"
                  type="number"
                  step="any"
                  value={metricTarget}
                  onChange={(e) => setMetricTarget(e.target.value)}
                />
              </div>
            </>
          )}
          {source === "subgoals" && (
            <p className="text-xs text-muted sm:col-span-2">Progress is the average of this goal&apos;s sub-goals.</p>
          )}
          {source === "projects" && (
            <p className="text-xs text-muted sm:col-span-2">
              Progress is the share of completed tasks across projects you link on the goal page.
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={!name.trim() || create.isPending}>
          {create.isPending && <Spinner size={14} className="text-current" />}
          Create goal
        </Button>
      </div>
    </form>
  );
}
