"use client";

import { useState } from "react";
import { Tag as TagIcon, Trash2 } from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useDeleteTag, useUpdateTag } from "@/lib/queries/tags";
import { Button } from "@/components/ui/button";
import { ColorSwatches, ConfirmDialog, InlineEdit } from "@/components/ui/misc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { colorHex } from "@/lib/utils";
import type { Tag } from "@/types/models";

/**
 * Heading for a tag's task list. Members rename and recolour it; its creator or
 * an admin can delete it (which removes it from every task).
 */
export function TagHeader({ tag, onDeleted }: { tag: Tag; onDeleted: () => void }) {
  const me = useMe();
  const update = useUpdateTag();
  const del = useDeleteTag();
  const [confirming, setConfirming] = useState(false);
  const canEdit = me.role !== "guest";
  const canDelete = canEdit && (me.role === "admin" || tag.created_by === me.id);

  const swatch = (
    <span className="flex h-7 w-7 items-center justify-center rounded-md text-white" style={{ background: colorHex(tag.color) }}>
      <TagIcon size={14} />
    </span>
  );

  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-1 sm:px-6">
      {canEdit ? (
        <Popover>
          <Tooltip content="Change colour">
            <PopoverTrigger asChild>
              <button type="button" aria-label="Change tag colour" className="rounded-md">
                {swatch}
              </button>
            </PopoverTrigger>
          </Tooltip>
          <PopoverContent className="w-56">
            <ColorSwatches value={tag.color} onChange={(color) => update.mutate({ id: tag.id, color })} />
          </PopoverContent>
        </Popover>
      ) : (
        swatch
      )}
      <div className="min-w-0 text-[15px] font-semibold">
        <InlineEdit value={tag.name} disabled={!canEdit} onSave={(name) => name.trim() && update.mutate({ id: tag.id, name })} />
      </div>
      {canDelete && (
        <Tooltip content="Delete tag">
          <Button variant="ghost" size="icon-sm" onClick={() => setConfirming(true)} aria-label="Delete tag">
            <Trash2 size={14} />
          </Button>
        </Tooltip>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete the tag “${tag.name}”?`}
        description="It will be removed from every task. The tasks themselves stay."
        confirmLabel="Delete tag"
        pending={del.isPending}
        onConfirm={() => del.mutate(tag.id, { onSuccess: onDeleted })}
      />
    </div>
  );
}
