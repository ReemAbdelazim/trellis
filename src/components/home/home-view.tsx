"use client";

import { format, startOfWeek } from "date-fns";
import { CheckCircle2, Users } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useMyTasks } from "@/lib/queries/tasks";
import { useRealtime } from "@/lib/queries/realtime";
import { useCollaborators } from "@/lib/queries/home";
import { qk } from "@/lib/queries/keys";
import { HomeMyTasksCard } from "./my-tasks-card";
import { HomeProjectsCard } from "./projects-card";
import { HomePeopleCard } from "./people-card";

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function HomeView() {
  const me = useMe();
  const { data: tasks, isLoading } = useMyTasks(me.id);
  const { data: collaborators = [] } = useCollaborators(me.id);
  useRealtime({ table: "tasks", filter: `assignee_id=eq.${me.id}`, invalidate: [qk.myTasks(me.id)] });

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).getTime();
  const completedThisWeek = (tasks ?? []).filter((t) => t.completed && t.completed_at && new Date(t.completed_at).getTime() >= weekStart).length;
  const firstName = me.full_name?.split(" ")[0] || "there";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="text-center">
        <p className="text-sm text-muted" suppressHydrationWarning>
          {format(now, "EEEE, MMMM d")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl" suppressHydrationWarning>
          {greeting(now)}, {firstName}
        </h1>
        <div className="mx-auto mt-3 inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-full bg-surface-2 px-4 py-1.5 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 size={14} className="text-success" />
            <b className="font-semibold text-text">{completedThisWeek}</b> tasks completed this week
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users size={14} />
            <b className="font-semibold text-text">{collaborators.length}</b> collaborators
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <HomeMyTasksCard tasks={tasks ?? []} loading={isLoading} />
        <HomeProjectsCard />
        <div className="lg:col-span-2">
          <HomePeopleCard collaborators={collaborators} />
        </div>
      </div>
    </div>
  );
}
