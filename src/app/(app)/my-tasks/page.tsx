import { Suspense } from "react";
import { PageLoader } from "@/components/ui/misc";
import { MyTasksView } from "@/components/my-tasks/my-tasks-view";

export const metadata = { title: "My tasks" };

export default function MyTasksPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <MyTasksView />
    </Suspense>
  );
}
