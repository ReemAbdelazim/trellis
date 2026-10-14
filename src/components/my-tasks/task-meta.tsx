"use client";

import Link from "next/link";
import { CornerDownRight } from "lucide-react";
import { cn, colorHex } from "@/lib/utils";
import type { Project } from "@/types/models";
import { routes } from "@/lib/routes";

/** Small coloured project label that links to the project. */
export function ProjectChip({
  project,
  className,
}: {
  project: Pick<Project, "id" | "name" | "color"> | null | undefined;
  className?: string;
}) {
  if (!project) return null;
  return (
    <Link
      href={routes.project(project.id)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex h-5 max-w-40 min-w-0 shrink items-center gap-1 rounded-full bg-surface-2 px-2 text-[11.5px] text-muted hover:bg-surface-3 hover:text-text",
        className,
      )}
      title={project.name}
    >
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colorHex(project.color) }} />
      <span className="truncate">{project.name}</span>
    </Link>
  );
}

/** "↳ Parent task" hint shown on subtasks. */
export function ParentHint({ name, className }: { name: string | undefined; className?: string }) {
  if (!name) return null;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-0.5 text-[11.5px] text-faint", className)} title={`Subtask of ${name}`}>
      <CornerDownRight size={11} className="shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}
