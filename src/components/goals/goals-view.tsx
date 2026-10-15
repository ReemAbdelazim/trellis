"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageLoader } from "@/components/ui/misc";
import { useIsGuest, useMe } from "@/lib/queries/me";
import { useTeams } from "@/lib/queries/people";
import { useGoalProgressMap, useGoals } from "@/lib/queries/goals";
import { cn } from "@/lib/utils";
import { CreateGoalDialog } from "./create-goal-dialog";
import { GoalTree } from "./goal-tree";

type Tab = "company" | "team" | "mine";

const TABS: { value: Tab; label: string }[] = [
  { value: "company", label: "Company goals" },
  { value: "team", label: "Team goals" },
  { value: "mine", label: "My goals" },
];

export function GoalsView() {
  const isGuest = useIsGuest();
  if (isGuest) {
    return (
      <EmptyState
        icon={<Target size={32} />}
        title="Goals are for members"
        description="Goals are shared with full members of the workspace. Ask an admin if you need access."
      />
    );
  }
  return <GoalsInner />;
}

function GoalsInner() {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data: goals = [], isLoading } = useGoals();
  const { data: teams = [] } = useTeams();
  const { map: progress } = useGoalProgressMap();
  const [tab, setTab] = useState<Tab>("company");
  const [dialogOpen, setDialogOpen] = useState(false);

  // The top bar links to /goals?new=1 — derive the dialog state from the URL.
  const newParam = params.get("new") === "1";
  const open = dialogOpen || newParam;
  const setOpen = (o: boolean) => {
    setDialogOpen(o);
    if (!o && newParam) {
      const next = new URLSearchParams(params.toString());
      next.delete("new");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  };

  const company = useMemo(() => goals.filter((g) => !g.team_id), [goals]);
  const mine = useMemo(() => goals.filter((g) => g.owner_id === me.id), [goals, me.id]);
  const byTeam = useMemo(() => {
    const groups = new Map<string, typeof goals>();
    for (const g of goals) {
      if (!g.team_id) continue;
      const list = groups.get(g.team_id) ?? [];
      list.push(g);
      groups.set(g.team_id, list);
    }
    return groups;
  }, [goals]);
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "Archived team";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Goals</h1>
          <p className="text-sm text-muted">Where we&apos;re headed, and how the work adds up.</p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus size={15} /> New goal
        </Button>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border scrollbar-thin" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              tab === t.value ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : tab === "team" ? (
        byTeam.size === 0 ? (
          <Empty onCreate={() => setOpen(true)} label="No team goals yet" />
        ) : (
          <div className="space-y-6">
            {[...byTeam.entries()]
              .sort((a, b) => teamName(a[0]).localeCompare(teamName(b[0])))
              .map(([teamId, list]) => (
                <section key={teamId}>
                  <h2 className="mb-2 text-sm font-semibold">{teamName(teamId)}</h2>
                  <GoalTree goals={list} progress={progress} />
                </section>
              ))}
          </div>
        )
      ) : (tab === "company" ? company : mine).length === 0 ? (
        <Empty
          onCreate={() => setOpen(true)}
          label={tab === "company" ? "No company goals yet" : "You don't own any goals yet"}
        />
      ) : (
        <GoalTree goals={tab === "company" ? company : mine} progress={progress} />
      )}

      <CreateGoalDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function Empty({ label, onCreate }: { label: string; onCreate: () => void }) {
  return (
    <EmptyState
      icon={<Target size={32} />}
      title={label}
      description="Set a goal, then connect sub-goals and projects to track progress automatically."
      action={
        <Button variant="primary" onClick={onCreate}>
          <Plus size={15} /> New goal
        </Button>
      }
    />
  );
}
