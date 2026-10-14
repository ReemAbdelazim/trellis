"use client";

import { PageLoader } from "@/components/ui/misc";
import { useCanEditProject, useProject } from "@/lib/queries/projects";
import { useProjectTasks } from "@/lib/queries/tasks";
import { useTaskPane } from "@/lib/task-pane";
import { ProjectDescription } from "../overview/project-description";
import { DetailsPanel, MembersPanel, MilestonesPanel, ProgressPanel } from "../overview/overview-panels";
import { StatusUpdates } from "../overview/status-updates";

export function ProjectOverview({ projectId }: { projectId: string }) {
  const { data: project, isLoading } = useProject(projectId);
  const { data: tasks = [] } = useProjectTasks(projectId);
  const canEdit = useCanEditProject(projectId);
  const { openTask } = useTaskPane();

  if (isLoading) return <PageLoader />;
  // The project header already explains missing / inaccessible projects.
  if (!project) return null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="description-heading">
            <h2 id="description-heading" className="mb-2 text-[15px] font-semibold">
              Project description
            </h2>
            <ProjectDescription key={project.id} project={project} canEdit={canEdit} />
          </section>
          <StatusUpdates project={project} canEdit={canEdit} />
          <MilestonesPanel tasks={tasks} canEdit={canEdit} onOpen={openTask} />
        </div>
        <aside className="flex min-w-0 flex-col gap-4">
          <ProgressPanel tasks={tasks} />
          <DetailsPanel project={project} canEdit={canEdit} />
          <MembersPanel project={project} />
        </aside>
      </div>
    </div>
  );
}
