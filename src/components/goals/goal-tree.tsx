"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/misc";
import { useProfileMap } from "@/lib/queries/people";
import { cn } from "@/lib/utils";
import type { Goal } from "@/types/models";
import { GoalProgress } from "./goal-bits";
import { routes } from "@/lib/routes";

/**
 * Hierarchical goal table. Roots are goals whose parent is not part of `goals`;
 * children are indented and collapsible.
 */
export function GoalTree({ goals, progress }: { goals: Goal[]; progress: Map<string, number> }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const { roots, childrenOf } = useMemo(() => {
    const ids = new Set(goals.map((g) => g.id));
    const childrenOf = new Map<string, Goal[]>();
    const roots: Goal[] = [];
    for (const g of goals) {
      if (g.parent_id && ids.has(g.parent_id) && g.parent_id !== g.id) {
        const list = childrenOf.get(g.parent_id) ?? [];
        list.push(g);
        childrenOf.set(g.parent_id, list);
      } else roots.push(g);
    }
    return { roots, childrenOf };
  }, [goals]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows: React.ReactNode[] = [];
  const walk = (g: Goal, depth: number, seen: Set<string>) => {
    if (seen.has(g.id)) return;
    seen.add(g.id);
    const kids = childrenOf.get(g.id) ?? [];
    const isCollapsed = collapsed.has(g.id);
    rows.push(
      <GoalRow
        key={g.id}
        goal={g}
        depth={depth}
        progress={progress.get(g.id) ?? 0}
        hasChildren={kids.length > 0}
        collapsed={isCollapsed}
        onToggle={() => toggle(g.id)}
      />,
    );
    if (!isCollapsed) kids.forEach((k) => walk(k, depth + 1, seen));
  };
  const seen = new Set<string>();
  roots.forEach((r) => walk(r, 0, seen));

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface scrollbar-thin">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[minmax(220px,1fr)_56px_110px_96px_150px] items-center gap-3 border-b border-border px-3 py-2 text-[11px] font-semibold tracking-wide text-faint uppercase">
          <span>Goal</span>
          <span>Owner</span>
          <span>Period</span>
          <span>Status</span>
          <span>Progress</span>
        </div>
        {rows}
      </div>
    </div>
  );
}

function GoalRow({
  goal,
  depth,
  progress,
  hasChildren,
  collapsed,
  onToggle,
}: {
  goal: Goal;
  depth: number;
  progress: number;
  hasChildren: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const people = useProfileMap();
  const owner = goal.owner_id ? people.get(goal.owner_id) : undefined;
  return (
    <div className="grid grid-cols-[minmax(220px,1fr)_56px_110px_96px_150px] items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-2">
      <div className="flex min-w-0 items-center gap-1" style={{ paddingLeft: depth * 20 }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sub-goals" : "Collapse sub-goals"}
            aria-expanded={!collapsed}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-3"
          >
            <ChevronRight size={14} className={cn("transition-transform", !collapsed && "rotate-90")} />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <Link href={routes.goal(goal.id)} className="truncate text-sm font-medium hover:underline">
          {goal.name}
        </Link>
      </div>
      <span>
        <Avatar profile={owner} size="sm" tooltip />
      </span>
      <span className="truncate text-xs text-muted">{goal.time_period || "—"}</span>
      <span>
        <StatusPill status={goal.status} />
      </span>
      <GoalProgress value={progress} />
    </div>
  );
}
