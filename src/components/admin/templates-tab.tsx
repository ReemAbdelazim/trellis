"use client";

import Link from "next/link";
import { toast } from "sonner";
import { FileStack } from "lucide-react";
import { useProfileMap } from "@/lib/queries/people";
import { useProjects, useUpdateProject } from "@/lib/queries/projects";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ColorDot, EmptyState, PageLoader } from "@/components/ui/misc";
import { errorMessage, timeAgo } from "@/lib/utils";
import { routes } from "@/lib/routes";

export function TemplatesTab() {
  const { data: projects = [], isLoading } = useProjects();
  const people = useProfileMap();
  const update = useUpdateProject();
  const templates = projects.filter((p) => p.is_template);

  if (isLoading) return <PageLoader />;
  if (templates.length === 0) {
    return (
      <EmptyState
        icon={<FileStack size={28} />}
        title="No templates yet"
        description="Open any project and choose “Save as template” from its menu. Templates appear in the New project dialog."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <ul className="divide-y divide-border">
        {templates.map((t) => {
          const owner = t.owner_id ? people.get(t.owner_id) : undefined;
          return (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <ColorDot color={t.color} className="h-3 w-3" />
              <div className="min-w-0 flex-1">
                <Link href={routes.project(t.id)} className="block truncate text-sm font-medium hover:underline">
                  {t.name}
                </Link>
                <div className="text-xs text-muted">
                  Updated {timeAgo(t.updated_at)}
                  {t.archived && " · Archived"}
                </div>
              </div>
              {owner && <Avatar profile={owner} size="sm" tooltip />}
              <Button
                size="sm"
                onClick={() =>
                  update.mutate(
                    { id: t.id, is_template: false },
                    {
                      onSuccess: () => toast.success(`${t.name} is now a regular project`),
                      onError: (err) => toast.error(errorMessage(err)),
                    },
                  )
                }
              >
                Stop using as template
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
