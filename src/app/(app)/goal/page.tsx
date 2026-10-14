"use client";

import { RecordPage } from "@/components/shell/record-page";
import { GoalDetail } from "@/components/goals/goal-detail";
import { routes } from "@/lib/routes";

export default function Page() {
  return (
    <RecordPage what="goal" backHref={routes.goals} backLabel="All goals" render={(id) => <GoalDetail key={id} goalId={id} />} />
  );
}
