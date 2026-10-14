"use client";

import { useSearchParams } from "next/navigation";
import { useProject } from "@/lib/queries/projects";
import { routes } from "@/lib/routes";
import { PageLoader } from "@/components/ui/misc";
import { NotFoundNotice } from "@/components/shell/record-page";
import { ProjectHeader } from "./project-header";
import { ProjectView } from "./project-views";
import { PROJECT_VIEWS, type ProjectViewId } from "./views-config";

function isView(v: string | null | undefined): v is ProjectViewId {
  return PROJECT_VIEWS.some((x) => x.id === v);
}

/** `/project?id=…&view=…` — the view falls back to the project's default view. */
export function ProjectPage({ projectId }: { projectId: string }) {
  const params = useSearchParams();
  const { data: project, isLoading } = useProject(projectId);

  if (isLoading) return <PageLoader />;
  if (!project) return <NotFoundNotice what="project" backHref={routes.projects} backLabel="Browse projects" />;

  const requested = params.get("view");
  const view: ProjectViewId = isView(requested) ? requested : isView(project.default_view) ? project.default_view : "list";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ProjectHeader projectId={projectId} view={view} />
      <div className="min-h-0 flex-1">
        <ProjectView projectId={projectId} view={view} />
      </div>
    </div>
  );
}
