"use client";

import { Popover as P } from "radix-ui";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;

export function PopoverContent({
  className,
  align = "start",
  ...props
}: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={4}
        collisionPadding={12}
        className={cn("z-[60] rounded-lg border border-border bg-surface p-2 shadow-pop focus:outline-none", className)}
        {...props}
      />
    </P.Portal>
  );
}
