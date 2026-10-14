"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { positionBetween } from "@/lib/utils";

/** Card wrapper used by the Workflow tab's managers (sections, fields, rules). */
export function ManagerCard({
  title,
  description,
  action,
  children,
  id,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id={id} className="text-[15px] font-semibold">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Up / down buttons for fractional-position lists. Calls onMove with the new position. */
export function ReorderButtons<T extends { position: number }>({
  items,
  index,
  onMove,
  label,
}: {
  items: T[];
  index: number;
  onMove: (position: number) => void;
  label: string;
}) {
  const up = () => {
    if (index === 0) return;
    onMove(positionBetween(items[index - 2]?.position, items[index - 1].position));
  };
  const down = () => {
    if (index >= items.length - 1) return;
    onMove(positionBetween(items[index + 1].position, items[index + 2]?.position));
  };
  return (
    <div className="flex shrink-0 items-center">
      <Button size="icon-sm" variant="ghost" aria-label={`Move ${label} up`} disabled={index === 0} onClick={up}>
        <ArrowUp size={13} />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Move ${label} down`}
        disabled={index >= items.length - 1}
        onClick={down}
      >
        <ArrowDown size={13} />
      </Button>
    </div>
  );
}
