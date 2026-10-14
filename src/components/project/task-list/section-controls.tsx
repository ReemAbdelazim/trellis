"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useCreateSection, useDeleteSection, useUpdateSection } from "@/lib/queries/projects";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, InlineEdit } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn, errorMessage, nextPosition, positionBetween } from "@/lib/utils";
import type { Section } from "@/types/models";

/** Section create / rename / delete state shared by the list and board views. */
export function useSectionActions(projectId: string, sections: Section[]) {
  const create = useCreateSection(projectId);
  const update = useUpdateSection(projectId);
  const del = useDeleteSection(projectId);
  // Bumping `n` remounts the section's name in edit mode.
  const [renaming, setRenaming] = useState<{ id: string; n: number } | null>(null);
  const [deleting, setDeleting] = useState<Section | null>(null);

  const startRename = (id: string) => setRenaming((r) => ({ id, n: (r?.n ?? 0) + 1 }));

  /** Add a section after `after` (or at the end) and start renaming it. */
  const add = async (after?: Section) => {
    const index = after ? sections.findIndex((s) => s.id === after.id) : -1;
    const position =
      index >= 0 ? positionBetween(sections[index].position, sections[index + 1]?.position) : nextPosition(sections);
    try {
      const section = await create.mutateAsync({ name: "Untitled section", position });
      startRename(section.id);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const rename = (id: string, name: string) =>
    update.mutate({ id, name }, { onError: (err) => toast.error(errorMessage(err)) });

  const remove = () => {
    if (!deleting) return;
    del.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return {
    add,
    adding: create.isPending,
    rename,
    startRename,
    renameKey: (id: string) => (renaming?.id === id ? renaming.n : 0),
    askDelete: setDeleting,
    deleting,
    remove,
    removing: del.isPending,
  };
}

export type SectionActions = ReturnType<typeof useSectionActions>;

/** Section title that can be renamed inline (or from the menu). */
export function SectionName({
  section,
  actions,
  canEdit,
  className,
}: {
  section: Section;
  actions: SectionActions;
  canEdit: boolean;
  className?: string;
}) {
  const key = actions.renameKey(section.id);
  return (
    <InlineEdit
      key={key}
      autoFocus={key > 0}
      value={section.name}
      disabled={!canEdit}
      placeholder="Untitled section"
      onSave={(name) => actions.rename(section.id, name)}
      className={cn("font-semibold", className)}
    />
  );
}

export function SectionMenu({
  section,
  actions,
  sectionCount,
  addLabel = "Add section below",
  className,
}: {
  section: Section;
  actions: SectionActions;
  sectionCount: number;
  addLabel?: string;
  className?: string;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Section actions for ${section.name}`} className={className}>
          <MoreHorizontal size={15} />
        </Button>
      </MenuTrigger>
      {/* Don't hand focus back to the trigger, or it would blur the rename box straight away. */}
      <MenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
        <MenuItem icon={<Pencil size={14} />} onSelect={() => actions.startRename(section.id)}>
          Rename section
        </MenuItem>
        <MenuItem icon={<Plus size={14} />} onSelect={() => actions.add(section)}>
          {addLabel}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          icon={<Trash2 size={14} />}
          danger
          disabled={sectionCount <= 1}
          onSelect={() => actions.askDelete(section)}
        >
          Delete section
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** Confirm dialog for deleting a section; its tasks move to the first remaining section. */
export function DeleteSectionDialog({
  actions,
  sections,
  taskCount,
}: {
  actions: SectionActions;
  sections: Section[];
  taskCount: (sectionId: string) => number;
}) {
  const section = actions.deleting;
  const target = sections.find((s) => s.id !== section?.id);
  const count = section ? taskCount(section.id) : 0;
  return (
    <ConfirmDialog
      open={!!section}
      onOpenChange={(open) => !open && actions.askDelete(null)}
      title={`Delete “${section?.name || "Untitled section"}”?`}
      description={
        count > 0 && target
          ? `${count} ${count === 1 ? "task" : "tasks"} in this section will move to “${target.name}”.`
          : "This section is empty."
      }
      confirmLabel="Delete section"
      pending={actions.removing}
      onConfirm={actions.remove}
    />
  );
}
