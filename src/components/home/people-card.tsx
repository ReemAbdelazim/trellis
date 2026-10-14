"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useActiveProfiles } from "@/lib/queries/people";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { HomeCard } from "./card";

const LIMIT = 12;

export function HomePeopleCard({ collaborators }: { collaborators: { userId: string; shared: number }[] }) {
  const me = useMe();
  const { data: profiles } = useActiveProfiles();
  const byId = new Map(profiles.map((p) => [p.id, p]));

  // Frequent collaborators first; top up with other teammates so the card is useful on day one.
  const people = collaborators
    .map((c) => ({ profile: byId.get(c.userId), shared: c.shared }))
    .filter((p) => p.profile)
    .slice(0, LIMIT);
  if (people.length < LIMIT && me.role !== "guest") {
    const taken = new Set(people.map((p) => p.profile!.id));
    for (const p of profiles) {
      if (people.length >= LIMIT) break;
      if (p.id === me.id || taken.has(p.id) || p.role === "guest") continue;
      people.push({ profile: p, shared: 0 });
    }
  }

  return (
    <HomeCard title="People" action={<span className="text-[13px] text-faint">Frequent collaborators</span>}>
      {!people.length ? (
        <EmptyState className="py-8" icon={<Users size={24} />} title="No collaborators yet" />
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {people.map(({ profile, shared }) => (
            <li key={profile!.id}>
              <Link
                href={`/search?assignee=${profile!.id}`}
                className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg p-3 text-center hover:bg-surface-2"
                title={`See tasks assigned to ${profile!.full_name || profile!.email}`}
              >
                <Avatar profile={profile} size="xl" />
                <span className="w-full truncate text-[13px] font-medium">{profile!.full_name || profile!.email}</span>
                <span className="w-full truncate text-[11.5px] text-faint">
                  {profile!.title || (shared ? `${shared} shared project${shared === 1 ? "" : "s"}` : profile!.email)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
