"use client";

import { Suspense } from "react";
import { PageLoader } from "@/components/ui/misc";
import { WorkloadView } from "@/components/workload/workload-view";

export default function WorkloadPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <WorkloadView />
    </Suspense>
  );
}
