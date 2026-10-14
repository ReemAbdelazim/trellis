"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { toast } from "sonner";
import { TriangleAlert, CalendarOff, SquareChartGantt, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, EmptyState, PageLoader } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { useProfileMap } from "@/lib/queries/people";
import { useCanEditProject, useSections } from "@/lib/queries/projects";
import { useRealtime } from "@/lib/queries/realtime";
import { qk } from "@/lib/queries/keys";
import { useSetDependency } from "@/lib/queries/task-detail";
import { sortByPosition, useProjectTasks, useUpdateTask, type TaskItem } from "@/lib/queries/tasks";
import { useTaskPane } from "@/lib/task-pane";
import { cn, toISODate } from "@/lib/utils";
import type { TaskUpdate } from "@/types/models";
import { useMediaQuery, useToday } from "../calendar/hooks";
import { DependencyLayer, type Edge } from "../timeline/dependency-layer";
import type { LinkHandlers } from "../timeline/timeline-bar";
import { TimelineSectionRow, TimelineTaskRow } from "../timeline/timeline-row";
import {
  computeRange,
  HEADER_H,
  headerTicks,
  PX_PER_DAY,
  ROW_H,
  taskSpan,
  ZOOMS,
  type Span,
  type Zoom,
} from "../timeline/timeline-scale";
import { TASK_DRAG_TYPE, UnscheduledTray } from "../timeline/unscheduled-tray";
import { projectDependenciesKey, useProjectDependencies } from "../timeline/use-project-dependencies";

type Group = { id: string; name: string; tasks: TaskItem[] };
type Row = { kind: "section"; group: Group } | { kind: "task"; task: TaskItem };
type PendingLink = { fromId: string; x1: number; y1: number; x2: number; y2: number };

const NO_SECTION = "__none";

export function ProjectTimelineView({ projectId }: { projectId: string }) {
  const { openTask } = useTaskPane();
  const { data: tasks = [], isLoading } = useProjectTasks(projectId);
  const { data: sections = [] } = useSections(projectId);
  const { data: deps = [] } = useProjectDependencies(projectId);
  const canEdit = useCanEditProject(projectId);
  const people = useProfileMap();
  const update = useUpdateTask();
  const setDependency = useSetDependency();
  const today = useToday();
  const narrow = useMediaQuery("(max-width: 639px)");
  const leftW = narrow ? 150 : 260;

  useRealtime({ table: "tasks", filter: `project_id=eq.${projectId}`, invalidate: [qk.projectTasks(projectId)] });
  useRealtime({ table: "task_dependencies", invalidate: [projectDependenciesKey(projectId)] });

  const [zoom, setZoom] = useState<Zoom>("weeks");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [trayOpen, setTrayOpen] = useState(false);
  const [link, setLink] = useState<PendingLink | null>(null);
  const [removing, setRemoving] = useState<Edge | null>(null);
  const [dropDay, setDropDay] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ start: number; ppd: number } | null>(null);
  const pendingCenter = useRef<Date | null>(null);

  const ppd = PX_PER_DAY[zoom];

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const spans = useMemo(() => new Map(tasks.map((t) => [t.id, taskSpan(t)])), [tasks]);
  const range = useMemo(
    () => computeRange([...spans.values()].filter((s): s is Span => !!s), today, zoom),
    [spans, today, zoom],
  );
  const gridW = range.days * ppd;
  const ticks = useMemo(() => headerTicks(zoom, range.start, range.end, ppd), [zoom, range, ppd]);
  const dayX = (d: Date) => differenceInCalendarDays(d, range.start) * ppd;

  const groups = useMemo<Group[]>(() => {
    const known = new Set(sections.map((s) => s.id));
    const sorted = sortByPosition(tasks);
    const list: Group[] = sections.map((s) => ({
      id: s.id,
      name: s.name,
      tasks: sorted.filter((t) => t.section_id === s.id),
    }));
    const loose = sorted.filter((t) => !t.section_id || !known.has(t.section_id));
    if (loose.length) list.unshift({ id: NO_SECTION, name: "No section", tasks: loose });
    return list;
  }, [tasks, sections]);

  const rows: Row[] = [];
  for (const group of groups) {
    rows.push({ kind: "section", group });
    if (!collapsed.has(group.id)) for (const task of group.tasks) rows.push({ kind: "task", task });
  }
  const rowIndex = new Map<string, number>();
  rows.forEach((r, i) => r.kind === "task" && rowIndex.set(r.task.id, i));
  const rowMid = (i: number) => i * ROW_H + ROW_H / 2;

  const unscheduled = tasks.filter((t) => !t.completed && !spans.get(t.id));

  // Dependency arrows (only between tasks drawn on the timeline).
  const edges: Edge[] = [];
  const conflicted = new Set<string>();
  for (const d of deps) {
    const blocker = taskById.get(d.depends_on_id);
    const blocked = taskById.get(d.task_id);
    const sa = spans.get(d.depends_on_id);
    const sb = spans.get(d.task_id);
    if (!blocker || !blocked || !sa || !sb) continue;
    const conflict = !blocker.completed && !blocked.completed && sb.s < sa.e;
    if (conflict) conflicted.add(blocked.id);
    const ia = rowIndex.get(blocker.id);
    const ib = rowIndex.get(blocked.id);
    if (ia === undefined || ib === undefined) continue;
    edges.push({
      key: `${d.depends_on_id}>${d.task_id}`,
      taskId: d.task_id,
      dependsOnId: d.depends_on_id,
      x1: blocker.is_milestone ? dayX(sa.e) + ppd / 2 + 8 : dayX(sa.e) + Math.max(ppd, 6),
      y1: rowMid(ia),
      x2: blocked.is_milestone ? dayX(sb.s) + ppd / 2 - 8 : dayX(sb.s),
      y2: rowMid(ib),
      conflict,
      label: `“${blocked.name || "Untitled"}” waits on “${blocker.name || "Untitled"}”`,
    });
  }

  // Keep the viewport steady: initial scroll to today, keep the centre date on zoom,
  // and compensate when the range grows to the left.
  const startMs = range.start.getTime();
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || isLoading) return;
    const viewW = el.clientWidth - leftW;
    const x = (d: Date) => differenceInCalendarDays(d, startMs) * ppd;
    const prev = anchor.current;
    if (pendingCenter.current) {
      el.scrollLeft = x(pendingCenter.current) - viewW / 2;
      pendingCenter.current = null;
    } else if (!prev) {
      el.scrollLeft = x(today) - Math.min(160, viewW / 4);
    } else if (prev.start !== startMs && prev.ppd === ppd) {
      el.scrollLeft += differenceInCalendarDays(prev.start, startMs) * ppd;
    }
    anchor.current = { start: startMs, ppd };
  }, [startMs, ppd, isLoading, leftW, today]);

  const changeZoom = (next: Zoom) => {
    if (next === zoom) return;
    const el = scrollRef.current;
    if (el) {
      const viewW = el.clientWidth - leftW;
      pendingCenter.current = addDays(range.start, Math.round((el.scrollLeft + viewW / 2) / ppd));
    }
    setZoom(next);
  };

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: dayX(today) - (el.clientWidth - leftW) / 2, behavior: "smooth" });
  };

  const commit = (id: string, patch: TaskUpdate) => update.mutate({ id, ...patch });

  const gridPoint = (e: { clientX: number; clientY: number }) => {
    const r = gridRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };

  const linkHandlers: LinkHandlers = {
    start: (fromId, e) => {
      const sp = spans.get(fromId);
      const idx = rowIndex.get(fromId);
      if (!sp || idx === undefined) return;
      const p = gridPoint(e);
      setLink({ fromId, x1: dayX(sp.e) + Math.max(ppd, 6), y1: rowMid(idx), x2: p.x, y2: p.y });
    },
    move: (e) => {
      if (!link) return;
      const p = gridPoint(e);
      setLink({ ...link, x2: p.x, y2: p.y });
    },
    end: (e) => {
      const from = link?.fromId;
      setLink(null);
      if (!from) return;
      const toId = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-task-bar]")?.getAttribute("data-task-bar");
      if (!toId || toId === from) return;
      if (deps.some((d) => d.task_id === toId && d.depends_on_id === from)) {
        toast.info("Those tasks are already linked");
        return;
      }
      setDependency.mutate(
        { taskId: toId, dependsOnId: from, add: true },
        { onSuccess: () => toast.success(`“${taskById.get(toId)?.name || "Task"}” now waits on “${taskById.get(from)?.name || "task"}”`) },
      );
    },
    cancel: () => setLink(null),
  };

  const dayFromClientX = (clientX: number) => {
    const r = gridRef.current?.getBoundingClientRect();
    if (!r) return null;
    const day = Math.floor((clientX - r.left) / ppd);
    return day >= 0 && day < range.days ? day : null;
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!canEdit || !e.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const day = dayFromClientX(e.clientX);
    if (day !== dropDay) setDropDay(day);
  };

  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData(TASK_DRAG_TYPE);
    const day = dayFromClientX(e.clientX);
    setDropDay(null);
    if (!id || day === null || !canEdit) return;
    e.preventDefault();
    update.mutate({ id, due_date: toISODate(addDays(range.start, day)), start_date: null });
  };

  if (isLoading) return <PageLoader />;

  const todayX = dayX(today);
  const bodyH = rows.length * ROW_H;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2 sm:px-6">
        <div role="group" aria-label="Zoom" className="inline-flex rounded-md border border-border p-0.5">
          {ZOOMS.map((z) => (
            <button
              key={z.id}
              type="button"
              aria-pressed={zoom === z.id}
              onClick={() => changeZoom(z.id)}
              className={cn(
                "h-6 rounded px-2.5 text-[12.5px] font-medium",
                zoom === z.id ? "bg-surface-3 text-text" : "text-muted hover:text-text",
              )}
            >
              {z.label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={scrollToToday}>
          Today
        </Button>
        <div className="flex-1" />
        {conflicted.size > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-danger">
            <TriangleAlert size={13} />
            {conflicted.size} date {conflicted.size === 1 ? "conflict" : "conflicts"}
          </span>
        )}
        {canEdit ? (
          <Tooltip content="Drag a bar to move it, drag its edges to change dates, or drag the dot at its end onto another task to add a dependency. Click an arrow to remove it.">
            <span className="hidden items-center gap-1 text-xs text-faint sm:flex" tabIndex={0}>
              <Link2 size={13} /> Tips
            </span>
          </Tooltip>
        ) : (
          <span className="text-xs text-faint">View only</span>
        )}
        <Button size="sm" variant={trayOpen ? "subtle" : "secondary"} aria-pressed={trayOpen} onClick={() => setTrayOpen((o) => !o)}>
          <CalendarOff size={14} />
          <span className="hidden sm:inline">Unscheduled</span>
          <span className="rounded-full bg-surface-3 px-1.5 text-[11px] text-muted">{unscheduled.length}</span>
        </Button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={<SquareChartGantt size={28} />}
          title="Nothing on the timeline yet"
          description="Add tasks in the List or Board view, then give them dates to plan them out here."
        />
      ) : (
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="scrollbar-thin absolute inset-0 overflow-auto overscroll-x-contain">
            <div className="relative" style={{ width: leftW + gridW, minHeight: "100%" }}>
              {/* Header */}
              <div className="sticky top-0 z-20 flex border-b border-border bg-surface" style={{ height: HEADER_H }}>
                <div
                  className="sticky left-0 z-[25] flex shrink-0 items-end border-r border-border bg-surface px-3 pb-1.5 text-xs font-medium text-muted"
                  style={{ width: leftW }}
                >
                  Task name
                </div>
                <div className="relative" style={{ width: gridW }} aria-hidden>
                  {ticks.top.map((t) => (
                    <div
                      key={t.key}
                      className="absolute top-0 h-6 overflow-hidden border-l border-border px-2 pt-1 text-xs font-medium whitespace-nowrap text-text"
                      style={{ left: t.x, width: t.w }}
                    >
                      {t.label}
                    </div>
                  ))}
                  {ticks.bottom.map((t) => (
                    <div
                      key={t.key}
                      className={cn(
                        "absolute bottom-0 flex h-7 items-center overflow-hidden border-t border-l border-border text-[11px] whitespace-nowrap",
                        zoom === "days" ? "flex-col justify-center gap-0 leading-tight" : "px-1.5",
                        t.weekend ? "text-faint" : "text-muted",
                      )}
                      style={{ left: t.x, width: t.w }}
                    >
                      {zoom === "days" && <span className="text-[9.5px] text-faint">{t.sub}</span>}
                      <span>{t.label}</span>
                    </div>
                  ))}
                  {todayX >= 0 && todayX <= gridW && (
                    <div
                      className="absolute bottom-0 z-[1] h-1 rounded-t bg-accent"
                      style={{ left: todayX, width: Math.max(ppd, 4) }}
                      title={`Today, ${format(today, "MMM d")}`}
                    />
                  )}
                </div>
              </div>

              {/* Body */}
              <div
                className="relative"
                style={{ height: bodyH + ROW_H * 2 }}
                onDragOver={onDragOver}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropDay(null);
                }}
                onDrop={onDrop}
              >
                <div ref={gridRef} className="pointer-events-none absolute top-0 bottom-0 z-0" style={{ left: leftW, width: gridW }} aria-hidden>
                  {ticks.bottom.map((t) =>
                    t.weekend ? (
                      <div key={t.key} className="absolute inset-y-0 bg-surface-2/70" style={{ left: t.x, width: t.w }} />
                    ) : null,
                  )}
                  {ticks.bottom.map((t) => (
                    <div key={`l${t.key}`} className="absolute inset-y-0 w-px bg-border/60" style={{ left: t.x }} />
                  ))}
                  {ticks.top.map((t) => (
                    <div key={`L${t.key}`} className="absolute inset-y-0 w-px bg-border" style={{ left: t.x }} />
                  ))}
                  {dropDay !== null && (
                    <div className="absolute inset-y-0 bg-accent-soft" style={{ left: dropDay * ppd, width: Math.max(ppd, 6) }} />
                  )}
                  {todayX >= 0 && todayX <= gridW && (
                    <div className="absolute inset-y-0 w-0.5 bg-accent" style={{ left: todayX + ppd / 2 - 1 }} />
                  )}
                </div>

                {rows.map((row) => {
                  if (row.kind === "section") {
                    const g = row.group;
                    const groupSpans = g.tasks.map((t) => spans.get(t.id)).filter((s): s is Span => !!s);
                    const summary = groupSpans.length
                      ? {
                          s: new Date(Math.min(...groupSpans.map((s) => s.s.getTime()))),
                          e: new Date(Math.max(...groupSpans.map((s) => s.e.getTime()))),
                        }
                      : null;
                    return (
                      <TimelineSectionRow
                        key={`s${g.id}`}
                        name={g.name}
                        count={g.tasks.length}
                        collapsed={collapsed.has(g.id)}
                        onToggle={() =>
                          setCollapsed((prev) => {
                            const next = new Set(prev);
                            if (next.has(g.id)) next.delete(g.id);
                            else next.add(g.id);
                            return next;
                          })
                        }
                        summary={summary}
                        rangeStart={range.start}
                        ppd={ppd}
                        leftW={leftW}
                        gridW={gridW}
                      />
                    );
                  }
                  const t = row.task;
                  return (
                    <TimelineTaskRow
                      key={t.id}
                      task={t}
                      span={spans.get(t.id) ?? null}
                      assignee={t.assignee_id ? people.get(t.assignee_id) : undefined}
                      conflict={conflicted.has(t.id)}
                      rangeStart={range.start}
                      ppd={ppd}
                      leftW={leftW}
                      gridW={gridW}
                      canEdit={canEdit}
                      onOpen={openTask}
                      onCommit={commit}
                      link={linkHandlers}
                    />
                  );
                })}

                <DependencyLayer
                  left={leftW}
                  width={gridW}
                  height={bodyH}
                  edges={edges}
                  pending={link}
                  onEdgeClick={canEdit ? setRemoving : undefined}
                />
              </div>
            </div>
          </div>

          {trayOpen && (
            <UnscheduledTray tasks={unscheduled} canEdit={canEdit} onOpen={openTask} onClose={() => setTrayOpen(false)} />
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove dependency?"
        description={removing ? `${removing.label.replace(" waits on ", " will no longer wait on ")}.` : undefined}
        confirmLabel="Remove"
        onConfirm={() => {
          if (removing) setDependency.mutate({ taskId: removing.taskId, dependsOnId: removing.dependsOnId, add: false });
          setRemoving(null);
        }}
      />
    </div>
  );
}
