"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useCreateTag, useSetTaskTag, useTagMap, useTags } from "@/lib/queries/tags";
import type { TaskItem } from "@/lib/queries/tasks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ColorDot } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { Tag } from "@/types/models";
import { TagChip } from "./tag-chip";

type TaggedTask = Pick<TaskItem, "id" | "tag_ids">;

/** The task pane's Tags field: the task's tags, plus a picker to add, remove or create them. */
export function TaskTags({ task, canEdit }: { task: TaggedTask; canEdit: boolean }) {
  const tags = useTagMap();
  const setTag = useSetTaskTag();
  const current = task.tag_ids.map((id) => tags.get(id)).filter((t): t is Tag => !!t);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {current.map((t) => (
        <TagChip
          key={t.id}
          tag={t}
          link
          onRemove={canEdit ? () => setTag.mutate({ task, tagId: t.id, on: false }) : undefined}
        />
      ))}
      {canEdit ? (
        <TagPicker task={task}>
          <button
            type="button"
            className="flex h-6 items-center gap-1 rounded px-1.5 text-[12.5px] text-faint hover:bg-surface-2 hover:text-text"
          >
            <Plus size={13} /> {current.length ? "Add" : "Add tags"}
          </button>
        </TagPicker>
      ) : (
        !current.length && <span className="text-faint">No tags</span>
      )}
    </div>
  );
}

/** Find a tag to toggle on the task, or create one from what was typed. */
function TagPicker({ task, children }: { task: TaggedTask; children: React.ReactNode }) {
  const me = useMe();
  const { data: tags = [] } = useTags();
  const setTag = useSetTaskTag();
  const create = useCreateTag();
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const matches = needle ? tags.filter((t) => t.name.toLowerCase().includes(needle)) : tags;
  const exact = tags.find((t) => t.name.toLowerCase() === needle);
  const canCreate = me.role !== "guest" && !!needle && !exact;

  const toggle = (tag: Tag) => setTag.mutate({ task, tagId: tag.id, on: !task.tag_ids.includes(tag.id) });
  // Clear the box straight away so typing can continue; put the name back if creating fails.
  const createAndAdd = () => {
    const name = query.trim();
    setQuery("");
    create.mutate(name, {
      onSuccess: (tag) => setTag.mutate({ task, tagId: tag.id, on: true }),
      onError: () => setQuery(name),
    });
  };

  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-1.5">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (exact) toggle(exact);
            else if (canCreate) createAndAdd();
          }}
          maxLength={50}
          placeholder={me.role === "guest" ? "Find a tag" : "Find or create a tag"}
          aria-label="Find or create a tag"
          className="mb-1 h-8 w-full rounded-md border border-border bg-surface px-2 text-[13px] outline-none placeholder:text-faint focus:border-accent"
        />
        <ul className="max-h-64 overflow-y-auto scrollbar-thin" role="listbox" aria-label="Tags" aria-multiselectable>
          {matches.map((t) => {
            const selected = task.tag_ids.includes(t.id);
            return (
              <li key={t.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => toggle(t)}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-surface-2"
                >
                  <ColorDot color={t.color} className="rounded-full" />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <Check size={14} className={cn("shrink-0 text-accent", !selected && "invisible")} />
                </button>
              </li>
            );
          })}
        </ul>
        {canCreate && (
          <button
            type="button"
            onClick={createAndAdd}
            disabled={create.isPending}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-accent hover:bg-surface-2"
          >
            <Plus size={14} className="shrink-0" />
            <span className="truncate">Create “{query.trim()}”</span>
          </button>
        )}
        {!matches.length && !canCreate && (
          <p className="px-2 py-1.5 text-[12.5px] text-faint">{tags.length ? "No matching tags" : "No tags yet"}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
