"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useElementSize } from "@/lib/hooks";

/** Card shell for a chart with a visible title and an accessible data table. */
export function ChartCard({
  title,
  description,
  legend,
  table,
  className,
  children,
}: {
  title: string;
  description?: string;
  legend?: React.ReactNode;
  /** Rows for the screen-reader table: [label, ...values]. */
  table: { columns: string[]; rows: (string | number)[][] };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border border-border bg-surface p-4 shadow-card", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
        {legend}
      </div>
      <div aria-hidden className="min-w-0 flex-1">
        {children}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j}>{v}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <span className={cn("h-2.5 w-2.5 rounded-sm", swatch)} />
      {label}
    </span>
  );
}

export function EmptyChart({ children }: { children: React.ReactNode }) {
  return <div className="flex h-40 items-center justify-center text-sm text-faint">{children}</div>;
}

/** Vertical column chart built with CSS. Values are printed above each column. */
export function ColumnChart({
  data,
  height = 160,
  minColumn = 36,
}: {
  data: { key: string; label: string; sublabel?: string; value: number; highlight?: boolean; title?: string }[];
  height?: number;
  minColumn?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <div className="flex items-stretch gap-1" style={{ minWidth: data.length * minColumn }}>
        {data.map((d) => (
          <div key={d.key} className="group flex min-w-0 flex-1 flex-col items-center" title={d.title ?? `${d.label}: ${d.value}`}>
            <div className="relative flex w-full flex-col items-center justify-end" style={{ height }}>
              <span className={cn("mb-1 text-[11.5px] tabular-nums", d.value ? "text-text" : "text-faint")}>{d.value}</span>
              <div
                className={cn(
                  "w-full max-w-10 rounded-t transition-[height] group-hover:opacity-80",
                  d.highlight ? "bg-accent" : "bg-accent/70",
                )}
                style={{ height: `${(d.value / max) * (height - 22)}px`, minHeight: d.value ? 3 : 0 }}
              />
            </div>
            <div className="mt-1 w-full border-t border-border pt-1 text-center">
              <div className={cn("truncate text-[11px]", d.highlight ? "font-semibold text-text" : "text-muted")}>{d.label}</div>
              {d.sublabel && <div className="truncate text-[10px] text-faint">{d.sublabel}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal stacked bars: an "open" segment and a "done" segment per row. */
export function StackedBars({
  data,
}: {
  data: { key: string; label: React.ReactNode; name: string; open: number; done: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.open + d.done));
  return (
    <ul className="flex flex-col gap-2.5">
      {data.map((d) => (
        <li key={d.key} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
          <div className="min-w-0 text-[13px]">{d.label}</div>
          <div className="flex min-w-0 items-center gap-2" title={`${d.name}: ${d.open} open, ${d.done} completed`}>
            <div className="flex h-3.5 min-w-0 flex-1 gap-[2px]">
              {d.open > 0 && <div className="rounded-l rounded-r-sm bg-accent" style={{ width: `${(d.open / max) * 100}%` }} />}
              {d.done > 0 && (
                <div
                  className={cn("rounded-r bg-border-strong", d.open === 0 ? "rounded-l" : "rounded-l-sm")}
                  style={{ width: `${(d.done / max) * 100}%` }}
                />
              )}
            </div>
            <span className="w-20 shrink-0 text-right text-[11.5px] text-muted tabular-nums">
              {d.open} · {d.done}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Single-series line + area chart with a hover crosshair. */
export function TrendChart({
  data,
  height = 180,
}: {
  data: { key: string; label: string; value: number; title: string }[];
  height?: number;
}) {
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 28, r: 12, t: 16, b: 24 };
  const w = Math.max(width, 200);
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const rawMax = Math.max(...data.map((d) => d.value), 0);
  const max = Math.max(4, Math.ceil(rawMax / 4) * 4);
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const pts = data.map((d, i) => ({ x: pad.l + i * step, y: pad.t + innerH - (d.value / max) * innerH, ...d }));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const area = pts.length ? `${line} L${pts[pts.length - 1].x},${pad.t + innerH} L${pts[0].x},${pad.t + innerH} Z` : "";
  const ticks = [0, max / 2, max];
  const active = hover !== null ? pts[hover] : null;
  const peak = pts.reduce<number | null>((best, p, i) => (best === null || p.value > pts[best].value ? i : best), null);

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={w} height={height} className="block overflow-visible" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => {
            const y = pad.t + innerH - (t / max) * innerH;
            return (
              <g key={t}>
                <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} strokeWidth={1} style={{ stroke: "var(--border)" }} />
                <text x={pad.l - 6} y={y + 3.5} textAnchor="end" fontSize={10.5} style={{ fill: "var(--text-faint)" }}>
                  {t}
                </text>
              </g>
            );
          })}
          <path d={area} style={{ fill: "var(--accent)", opacity: 0.12 }} />
          <path d={line} fill="none" strokeWidth={2} strokeLinejoin="round" style={{ stroke: "var(--accent)" }} />
          {active && (
            <line x1={active.x} x2={active.x} y1={pad.t} y2={pad.t + innerH} strokeDasharray="3 3" style={{ stroke: "var(--border-strong)" }} />
          )}
          {pts.map((p, i) => (
            <g key={p.key}>
              <circle
                cx={p.x}
                cy={p.y}
                r={hover === i ? 5 : 4}
                strokeWidth={2}
                style={{ fill: "var(--surface)", stroke: "var(--accent)" }}
              />
              {(i === pts.length - 1 || i === peak) && hover === null && (
                <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize={11} fontWeight={600} style={{ fill: "var(--text)" }}>
                  {p.value}
                </text>
              )}
              <text x={p.x} y={height - 6} textAnchor="middle" fontSize={10.5} style={{ fill: "var(--text-muted)" }}>
                {p.label}
              </text>
              <rect
                x={p.x - step / 2}
                y={pad.t}
                width={Math.max(step, 24)}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          ))}
        </svg>
      )}
      {active && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-surface px-2 py-1 text-xs whitespace-nowrap shadow-pop"
          style={{ left: Math.min(Math.max(active.x, 60), w - 60), top: 0 }}
        >
          <span className="font-semibold tabular-nums">{active.value}</span> <span className="text-muted">{active.title}</span>
        </div>
      )}
    </div>
  );
}
