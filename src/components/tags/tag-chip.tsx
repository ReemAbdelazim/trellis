"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useTagMap } from "@/lib/queries/tags";
import { routes } from "@/lib/routes";
import { cn, colorHex } from "@/lib/utils";
import type { Tag } from "@/types/models";

const CHIP = "inline-flex h-5 max-w-40 min-w-0 shrink-0 items-center gap-1 rounded-full px-2 text-[11.5px] leading-none text-text";

/** A tag's name on a tint of its colour; links to every task with the tag when `link` is set. */
export function TagChip({
  tag,
  link = false,
  onRemove,
  className,
}: {
  tag: Pick<Tag, "id" | "name" | "color">;
  link?: boolean;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span className={cn(CHIP, onRemove && "pr-1", className)} style={{ backgroundColor: `${colorHex(tag.color)}33` }}>
      {link ? (
        <Link href={routes.tag(tag.id)} onClick={(e) => e.stopPropagation()} className="min-w-0 truncate hover:underline">
          {tag.name}
        </Link>
      ) : (
        <span className="truncate">{tag.name}</span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${tag.name}`}
          className="rounded-full p-0.5 text-muted hover:bg-black/10 hover:text-text"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

/** A task's tags, showing at most `max` and a "+N" for the rest. */
export function TagChips({ ids, max = Infinity, className }: { ids: string[]; max?: number; className?: string }) {
  const tags = useTagMap();
  const list = ids.map((id) => tags.get(id)).filter((t): t is Tag => !!t);
  if (!list.length) return null;
  const shown = list.slice(0, max);
  const rest = list.slice(max);
  return (
    <span className={cn("flex min-w-0 items-center gap-1 overflow-hidden", className)}>
      {shown.map((t) => (
        <TagChip key={t.id} tag={t} />
      ))}
      {rest.length > 0 && (
        <span className={cn(CHIP, "bg-surface-2 text-muted")} title={rest.map((t) => t.name).join(", ")}>
          +{rest.length}
        </span>
      )}
    </span>
  );
}
