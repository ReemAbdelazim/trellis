/**
 * Every in-app URL is built here. The app is a static export (GitHub Pages),
 * so records are addressed with query parameters rather than path segments.
 */
export const routes = {
  home: "/home",
  myTasks: "/my-tasks",
  inbox: "/inbox",
  projects: "/projects",
  teams: "/teams",
  goals: "/goals",
  portfolios: "/portfolios",
  workload: "/workload",
  admin: "/admin",
  settings: "/settings",
  login: "/login",

  project: (id: string, view?: string) => `/project?id=${id}${view ? `&view=${view}` : ""}`,
  team: (id: string) => `/team?id=${id}`,
  goal: (id: string) => `/goal?id=${id}`,
  portfolio: (id: string) => `/portfolio?id=${id}`,
  search: (q: string) => `/search?q=${encodeURIComponent(q)}`,

  /** Opens a task in the pane on its project's list, or on My tasks for personal tasks. */
  task: (taskId: string, projectId?: string | null) =>
    projectId ? `/project?id=${projectId}&view=list&task=${taskId}` : `/my-tasks?task=${taskId}`,
};

/** Sub-path the site is served from (e.g. "/seeds-tasks" on GitHub Pages). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Absolute URL for an in-app path, for copying, emails and OAuth redirects. */
export function absoluteUrl(path: string) {
  return `${window.location.origin}${BASE_PATH}${path}`;
}
