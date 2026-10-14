"use client";

import { Suspense } from "react";
import { PageLoader } from "@/components/ui/misc";
import { GoalsView } from "@/components/goals/goals-view";

export default function GoalsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <GoalsView />
    </Suspense>
  );
}
