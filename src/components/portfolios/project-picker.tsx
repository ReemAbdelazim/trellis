"use client";

import { useMemo, useState } from "react";
import { useProjects } from "@/lib/queries/projects";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ColorDot } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/** Searchable picker of projects the user can see (excludes archived/templates and `exclude`). */
export function ProjectPicker({
  exclude = [],
  onPick,
  children,
  align = "start",
}: {
  exclude?: string[];
  onPick: (projectId: string) => void;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-0">
        <ProjectList
          exclude={exclude}
          onPick={(id) => {
            onPick(id);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function ProjectList({ exclude, onPick }: { exclude: string[]; onPick: (id: string) => void }) {
  const { data: projects = [] } = useProjects();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return projects
      .filter((p) => !p.archived && !p.is_template && !exclude.includes(p.id))
      .filter((p) => !needle || p.name.toLowerCase().includes(needle))
      .slice(0, 50);
  }, [projects, q, exclude]);

  return (
    <div>
      <div className="border-b border-border p-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, list.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && list[active]) {
              e.preventDefault();
              onPick(list[active].id);
            }
          }}
          placeholder="Search projects…"
          className="h-8 w-full rounded-md bg-surface-2 px-2 text-sm outline-none placeholder:text-faint"
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
        {list.map((p, i) => (
          <button
            type="button"
            key={p.id}
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(p.id)}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
              i === active && "bg-surface-2",
            )}
          >
            <ColorDot color={p.color} />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
          </button>
        ))}
        {list.length === 0 && <div className="px-2 py-6 text-center text-sm text-faint">No projects</div>}
      </div>
    </div>
  );
}
