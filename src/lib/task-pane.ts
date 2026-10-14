"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * The task detail pane is driven by the `?task=<id>` search param so any
 * page can open a task and the URL is shareable.
 */
export function useTaskPane() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const taskId = params.get("task");

  const setTask = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set("task", id);
      else next.delete("task");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return {
    taskId,
    openTask: (id: string) => setTask(id),
    closeTask: () => setTask(null),
  };
}

