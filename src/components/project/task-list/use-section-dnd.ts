"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  closestCenter,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DraggableSyntheticListeners,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { qk } from "@/lib/queries/keys";
import { useUpdateSection } from "@/lib/queries/projects";
import { patchTaskInCaches, useUpdateTask, type TaskItem } from "@/lib/queries/tasks";
import { toast } from "sonner";
import { errorMessage, nextPosition, positionBetween } from "@/lib/utils";
import type { Section } from "@/types/models";

// ---------------------------------------------------------------------------
// Drag ids: sections and tasks share one DndContext, so ids carry their type.
// ---------------------------------------------------------------------------

export const taskDndId = (id: string) => `task:${id}`;
export const sectionDndId = (id: string) => `section:${id}`;

function parseDndId(id: UniqueIdentifier): { type: "task" | "section"; id: string } {
  const s = String(id);
  return s.startsWith("section:") ? { type: "section", id: s.slice(8) } : { type: "task", id: s.slice(5) };
}

type Groups = Record<string, string[]>;

function findContainer(groups: Groups, taskId: string) {
  return Object.keys(groups).find((key) => groups[key].includes(taskId));
}

function sameOrder(a: string[] | undefined, b: string[] | undefined) {
  return !!a && !!b && a.length === b.length && a.every((id, i) => id === b[i]);
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest("input, textarea, select, [contenteditable=true]");
}

/**
 * Wrap sortable listeners so typing in an inner input never starts a drag
 * (Space in a rename box) and keyboard drags only start from the element itself.
 */
export function guardDragListeners(listeners: DraggableSyntheticListeners) {
  if (!listeners) return undefined;
  const out: Record<string, (e: React.SyntheticEvent) => void> = {};
  for (const [key, fn] of Object.entries(listeners)) {
    out[key] = (e) => {
      if (key === "onKeyDown" ? e.target !== e.currentTarget : isEditableTarget(e.target)) return;
      fn(e);
    };
  }
  return out;
}

/** While dragging (base = null) or until the cache catches up with a drop (base set). */
interface Override {
  tasks: Groups;
  sections: string[];
  base: { groups: Groups; sectionIds: string[] } | null;
}

/**
 * Shared drag-and-drop state for views that show tasks grouped by section
 * (list rows, board cards) with sortable sections. Moves are optimistic: the
 * dropped order is held locally until the query cache reflects it, so nothing
 * snaps back for a frame.
 */
export function useSectionDnd({
  projectId,
  sections,
  groups,
  tasksById,
  allBySection,
  manual,
}: {
  projectId: string;
  sections: Section[];
  /** Visible task ids per section in display order (memoized by the caller). */
  groups: Groups;
  tasksById: Map<string, TaskItem>;
  /** Every task per section, ignoring filters (append positions). */
  allBySection: Map<string, TaskItem[]>;
  /** Manual ordering: drops set positions. When sorted, drops only change the section. */
  manual: boolean;
}) {
  const qc = useQueryClient();
  const updateTask = useUpdateTask();
  const updateSection = useUpdateSection(projectId);
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);

  const [active, setActive] = useState<{ type: "task" | "section"; id: string } | null>(null);
  const [override, setOverride] = useState<Override | null>(null);

  // A pending drop is released as soon as fresh data arrives.
  const stale = !!override?.base && (override.base.groups !== groups || override.base.sectionIds !== sectionIds);
  if (stale) setOverride(null);
  const current = stale ? null : override;
  const items = current?.tasks ?? groups;
  const order = current?.sections ?? sectionIds;

  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMoved = useRef(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      recentlyMoved.current = false;
    });
    return () => cancelAnimationFrame(raf);
  }, [items]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter is reserved for opening tasks; Space picks up.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      if (parseDndId(args.active.id).type === "section") {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter((c) => parseDndId(c.id).type === "section"),
        });
      }
      if (recentlyMoved.current && lastOverId.current) return [{ id: lastOverId.current }];
      const pointer = pointerWithin(args);
      const hits = pointer.length ? pointer : rectIntersection(args);
      let result = hits.filter((h) => parseDndId(h.id).type === "task").slice(0, 1);
      if (!result.length) {
        const sectionHit = hits.find((h) => parseDndId(h.id).type === "section");
        if (sectionHit) {
          const ids = items[parseDndId(sectionHit.id).id] ?? [];
          const near = ids.length
            ? closestCenter({
                ...args,
                droppableContainers: args.droppableContainers.filter((c) => {
                  const p = parseDndId(c.id);
                  return p.type === "task" && ids.includes(p.id);
                }),
              })
            : [];
          result = near.length ? near.slice(0, 1) : [sectionHit];
        }
      }
      if (result.length) lastOverId.current = result[0].id;
      return result.length ? result : lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [items],
  );

  const onDragStart = ({ active: a }: DragStartEvent) => {
    lastOverId.current = null;
    setActive(parseDndId(a.id));
    setOverride({ tasks: items, sections: order, base: null });
  };

  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    const dragged = parseDndId(a.id);
    if (!over || dragged.type !== "task") return;
    const target = parseDndId(over.id);
    const translated = a.rect.current.translated;
    const below = !!translated && translated.top > over.rect.top + over.rect.height / 2;
    const prev = override;
    if (!prev) return;
    const from = findContainer(prev.tasks, dragged.id);
    const to = target.type === "section" ? target.id : findContainer(prev.tasks, target.id);
    if (!from || !to || from === to || !prev.tasks[to]) return;
    // Crossing into another section: re-home the id now so the target list opens a gap.
    const toList = prev.tasks[to].filter((id) => id !== dragged.id);
    const overIndex = target.type === "task" ? toList.indexOf(target.id) : -1;
    toList.splice(overIndex >= 0 ? overIndex + (below ? 1 : 0) : toList.length, 0, dragged.id);
    recentlyMoved.current = true;
    setOverride({
      ...prev,
      tasks: { ...prev.tasks, [from]: prev.tasks[from].filter((id) => id !== dragged.id), [to]: toList },
    });
  };

  const moveTask = (id: string, patch: { section_id: string; position: number }) => {
    // Patch synchronously so the drop and the cache agree before the request starts.
    patchTaskInCaches(qc, id, patch);
    updateTask.mutate(
      { id, ...patch },
      { onError: () => qc.invalidateQueries({ queryKey: qk.projectTasks(projectId) }) },
    );
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const dragged = parseDndId(a.id);
    const state = override;
    setActive(null);
    if (!over || !state) return setOverride(null);
    const target = parseDndId(over.id);
    const settle = (next: Partial<Pick<Override, "tasks" | "sections">>) =>
      setOverride({ ...state, ...next, base: { groups, sectionIds } });

    if (dragged.type === "section") {
      const from = state.sections.indexOf(dragged.id);
      const to = state.sections.indexOf(target.id);
      if (target.type !== "section" || from < 0 || to < 0 || from === to) return setOverride(null);
      const next = arrayMove(state.sections, from, to);
      const pos = (id?: string) => sections.find((s) => s.id === id)?.position;
      settle({ sections: next });
      updateSection.mutate(
        { id: dragged.id, position: positionBetween(pos(next[to - 1]), pos(next[to + 1])) },
        { onError: (err) => toast.error(errorMessage(err)) },
      );
      return;
    }

    const container = findContainer(state.tasks, dragged.id);
    const original = findContainer(groups, dragged.id);
    if (!container) return setOverride(null);
    let list = state.tasks[container];
    if (target.type === "task" && target.id !== dragged.id && list.includes(target.id)) {
      list = arrayMove(list, list.indexOf(dragged.id), list.indexOf(target.id));
    }

    if (!manual) {
      // Sorted views: only a section change means anything.
      if (container === original) return setOverride(null);
      settle({ tasks: { ...state.tasks, [container]: list } });
      const others = (allBySection.get(container) ?? []).filter((t) => t.id !== dragged.id);
      moveTask(dragged.id, { section_id: container, position: nextPosition(others) });
      return;
    }

    if (container === original && sameOrder(list, groups[container])) return setOverride(null);
    settle({ tasks: { ...state.tasks, [container]: list } });
    const index = list.indexOf(dragged.id);
    const prev = tasksById.get(list[index - 1]);
    const next = tasksById.get(list[index + 1]);
    const position = positionBetween(prev?.position, next?.position);
    if (prev && next && !(prev.position < position && position < next.position)) {
      // Positions collided (equal neighbours). Renumber the whole section, including
      // tasks hidden by the current filter, so their order is preserved too.
      const full = (allBySection.get(container) ?? [])
        .filter((t) => t.id !== dragged.id)
        .sort((x, y) => x.position - y.position)
        .map((t) => t.id);
      full.splice(full.indexOf(prev.id) + 1, 0, dragged.id);
      full.forEach((id, i) => {
        const t = tasksById.get(id) ?? (allBySection.get(container) ?? []).find((x) => x.id === id);
        const p = (i + 1) * 1000;
        if (t && (t.position !== p || id === dragged.id)) moveTask(id, { section_id: container, position: p });
      });
      return;
    }
    moveTask(dragged.id, { section_id: container, position });
  };

  const onDragCancel = () => {
    setActive(null);
    setOverride(null);
  };

  return {
    /** Spread onto <DndContext>. */
    context: {
      sensors,
      collisionDetection,
      measuring: { droppable: { strategy: MeasuringStrategy.Always } },
      onDragStart,
      onDragOver,
      onDragEnd,
      onDragCancel,
    },
    /** Visible task ids per section, reflecting an in-progress drag. */
    items,
    /** Section ids in display order. */
    order,
    activeTask: active?.type === "task" ? (tasksById.get(active.id) ?? null) : null,
    activeSection: active?.type === "section" ? (sections.find((s) => s.id === active.id) ?? null) : null,
  };
}
