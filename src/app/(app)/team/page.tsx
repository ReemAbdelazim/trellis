"use client";

import { RecordPage } from "@/components/shell/record-page";
import { TeamPage } from "@/components/teams/team-page";
import { routes } from "@/lib/routes";

export default function Page() {
  return (
    <RecordPage what="team" backHref={routes.teams} backLabel="All teams" render={(id) => <TeamPage key={id} teamId={id} />} />
  );
}
