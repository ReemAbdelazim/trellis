"use client";

import { useId } from "react";
import { ROW_H } from "./timeline-scale";

export type Edge = {
  key: string;
  taskId: string;
  dependsOnId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  conflict: boolean;
  label: string;
};

/** Orthogonal connector from the blocker's end to the blocked task's start. */
function edgePath({ x1, y1, x2, y2 }: Pick<Edge, "x1" | "y1" | "x2" | "y2">) {
  const g = 8;
  if (x2 - x1 >= g * 2) return `M${x1},${y1} H${x1 + g} V${y2} H${x2 - 1}`;
  const ym = y2 > y1 ? y2 - ROW_H / 2 : y2 + ROW_H / 2;
  return `M${x1},${y1} H${x1 + g} V${ym} H${x2 - g} V${y2} H${x2 - 1}`;
}

/** SVG overlay for dependency arrows plus the in-progress "link" line. */
export function DependencyLayer({
  left,
  width,
  height,
  edges,
  pending,
  onEdgeClick,
}: {
  left: number;
  width: number;
  height: number;
  edges: Edge[];
  pending: { x1: number; y1: number; x2: number; y2: number } | null;
  onEdgeClick?: (edge: Edge) => void;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className="pointer-events-none absolute top-0 z-[1] overflow-visible"
      style={{ left, width, height }}
      width={width}
      height={height}
      aria-hidden={edges.length === 0 && !pending}
    >
      <defs>
        <marker id={`${id}-n`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" style={{ fill: "var(--text-faint)" }} />
        </marker>
        <marker id={`${id}-c`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" style={{ fill: "var(--danger)" }} />
        </marker>
        <marker id={`${id}-p`} viewBox="0 0 8 8" refX="4" refY="4" markerWidth="8" markerHeight="8">
          <circle cx="4" cy="4" r="3" style={{ fill: "var(--accent)" }} />
        </marker>
      </defs>
      {edges.map((edge) => {
        const d = edgePath(edge);
        return (
          <g key={edge.key}>
            <path
              d={d}
              fill="none"
              strokeWidth={1.5}
              style={{ stroke: edge.conflict ? "var(--danger)" : "var(--text-faint)" }}
              markerEnd={`url(#${id}-${edge.conflict ? "c" : "n"})`}
            />
            {onEdgeClick && (
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={10}
                className="cursor-pointer"
                style={{ pointerEvents: "stroke" }}
                onClick={() => onEdgeClick(edge)}
              >
                <title>{edge.label} (click to remove)</title>
              </path>
            )}
          </g>
        );
      })}
      {pending && (
        <line
          x1={pending.x1}
          y1={pending.y1}
          x2={pending.x2}
          y2={pending.y2}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          style={{ stroke: "var(--accent)" }}
          markerEnd={`url(#${id}-p)`}
        />
      )}
    </svg>
  );
}
