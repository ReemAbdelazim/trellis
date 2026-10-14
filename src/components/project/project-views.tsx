"use client";

import { ProjectListView } from "./views/list-view";
import { ProjectBoardView } from "./views/board-view";
import { ProjectTimelineView } from "./views/timeline-view";
import { ProjectCalendarView } from "./views/calendar-view";
import { ProjectOverview } from "./views/overview";
import { ProjectDashboard } from "./views/dashboard";
import { ProjectWorkflow } from "./views/workflow";

export function ProjectView({ projectId, view }: { projectId: string; view: string }) {
  switch (view) {
    case "overview":
      return <ProjectOverview projectId={projectId} />;
    case "board":
      return <ProjectBoardView projectId={projectId} />;
    case "timeline":
      return <ProjectTimelineView projectId={projectId} />;
    case "calendar":
      return <ProjectCalendarView projectId={projectId} />;
    case "dashboard":
      return <ProjectDashboard projectId={projectId} />;
    case "workflow":
      return <ProjectWorkflow projectId={projectId} />;
    default:
      return <ProjectListView projectId={projectId} />;
  }
}
