"use client";

import { RecordPage } from "@/components/shell/record-page";
import { ProjectPage } from "@/components/project/project-page";
import { routes } from "@/lib/routes";

export default function Page() {
  return (
    <RecordPage what="project" backHref={routes.projects} backLabel="Browse projects" render={(id) => <ProjectPage key={id} projectId={id} />} />
  );
}
