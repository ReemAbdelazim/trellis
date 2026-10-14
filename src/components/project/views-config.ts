export const PROJECT_VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "list", label: "List" },
  { id: "board", label: "Board" },
  { id: "timeline", label: "Timeline" },
  { id: "calendar", label: "Calendar" },
  { id: "dashboard", label: "Dashboard" },
  { id: "workflow", label: "Workflow" },
] as const;

export type ProjectViewId = (typeof PROJECT_VIEWS)[number]["id"];
