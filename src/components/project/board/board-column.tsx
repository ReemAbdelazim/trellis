"use client";

import { useRef, useState } from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { TaskItem } from "@/lib/queries/tasks";
import type { Section } from "@/types/models";
import { SectionMenu, SectionName, type SectionActions } from "../task-list/section-controls";
import { guardDragListeners, sectionDndId, taskDndId } from "../task-list/use-section-dnd";

export const COLUMN_WIDTH = "w-[272px]";

export function BoardColumn({
  section,
  tasks,
  total,
  canEdit,
  actions,
  sectionCount,
  composeSignal,
  onCreate,
  children,
}: {
  section: Section;
  tasks: TaskItem[];
  total: number;
  canEdit: boolean;
  actions: SectionActions;
  sectionCount: number;
  /** Bump to open this column's composer from outside (toolbar "Add task"). */
  composeSignal: number;
  onCreate: (name: string) => void;
  children: (task: TaskItem) => React.ReactNode;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: sectionDndId(section.id),
    disabled: !canEdit,
  });
  const [composing, setComposing] = useState(false);

  // Open the composer when the signal changes (derived during render, no effect).
  const [seenSignal, setSeenSignal] = useState(composeSignal);
  if (seenSignal !== composeSignal) {
    setSeenSignal(composeSignal);
    if (composeSignal > 0) setComposing(true);
  }

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={section.name}
      className={cn(
        "flex max-h-full shrink-0 flex-col rounded-xl bg-surface-2",
        COLUMN_WIDTH,
        isDragging && "opacity-40",
      )}
    >
      <header
        {...attributes}
        {...guardDragListeners(listeners)}
        role={undefined}
        tabIndex={canEdit ? 0 : undefined}
        aria-label={canEdit ? `Section ${section.name}. Press space to move.` : undefined}
        className={cn(
          "group/col flex h-11 shrink-0 items-center gap-1 rounded-t-xl px-3 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
          canEdit && "cursor-grab active:cursor-grabbing",
        )}
      >
        <div className="min-w-0 flex-1 text-[14px]">
          <SectionName section={section} actions={actions} canEdit={canEdit} />
        </div>
        <span className="shrink-0 px-1 text-[12px] text-faint tabular-nums">{total}</span>
        {canEdit && (
          <>
            <Tooltip content="Add task">
              <Button variant="ghost" size="icon-sm" onClick={() => setComposing(true)} aria-label={`Add task to ${section.name}`}>
                <Plus size={15} />
              </Button>
            </Tooltip>
            <SectionMenu section={section} actions={actions} sectionCount={sectionCount} addLabel="Add section to the right" />
          </>
        )}
      </header>
      <div className="flex min-h-12 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 scrollbar-thin">
        <SortableContext items={tasks.map((t) => taskDndId(t.id))} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => children(t))}
        </SortableContext>
        {composing && <CardComposer onCreate={onCreate} onClose={() => setComposing(false)} />}
      </div>
      {canEdit && !composing && (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="mx-2 mb-2 flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted hover:bg-surface-3 hover:text-text"
        >
          <Plus size={14} /> Add task
        </button>
      )}
    </section>
  );
}

/** Inline card composer: Enter adds and stays open, Escape (or leaving it empty) closes. */
function CardComposer({ onCreate, onClose }: { onCreate: (name: string) => void; onClose: () => void }) {
  const [value, setValue] = useState("");
  // Escape closes without saving, even if the unmount blurs the textarea.
  const cancelled = useRef(false);
  const submit = () => {
    const name = value.replace(/\s*\n+\s*/g, " ").trim(); // task names are single-line
    if (name) onCreate(name);
    setValue("");
  };
  return (
    <div className="rounded-lg border border-accent bg-surface p-2 shadow-card">
      <textarea
        autoFocus
        rows={2}
        value={value}
        placeholder="Write a task name"
        aria-label="New task name"
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })}
        onBlur={() => {
          if (cancelled.current) return;
          submit();
          onClose();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
            e.currentTarget.scrollIntoView({ block: "nearest" });
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelled.current = true;
            onClose();
          }
        }}
        className="block w-full resize-none bg-transparent text-[13.5px] leading-snug outline-none placeholder:text-faint"
      />
    </div>
  );
}
