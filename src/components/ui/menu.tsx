"use client";

import { DropdownMenu as M } from "radix-ui";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuSub = M.Sub;

const contentClass =
  "z-[60] min-w-48 overflow-hidden rounded-lg border border-border bg-surface p-1 text-sm shadow-pop";

export function MenuContent({
  className,
  align = "start",
  ...props
}: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={4} className={cn(contentClass, className)} {...props} />
    </M.Portal>
  );
}

export function MenuItem({
  className,
  icon,
  danger,
  children,
  ...props
}: React.ComponentProps<typeof M.Item> & { icon?: React.ReactNode; danger?: boolean }) {
  return (
    <M.Item
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2",
        danger && "text-danger",
        className,
      )}
      {...props}
    >
      {icon && <span className="flex w-4 justify-center text-muted">{icon}</span>}
      {children}
    </M.Item>
  );
}

export function MenuCheckItem({
  checked,
  children,
  ...props
}: React.ComponentProps<typeof M.Item> & { checked?: boolean }) {
  return (
    <M.Item
      className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 outline-none select-none data-[highlighted]:bg-surface-2"
      {...props}
    >
      <span className="flex w-4 justify-center text-accent">{checked && <Check size={14} />}</span>
      {children}
    </M.Item>
  );
}

export function MenuSubTrigger({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <M.SubTrigger className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 outline-none select-none data-[highlighted]:bg-surface-2 data-[state=open]:bg-surface-2">
      {icon && <span className="flex w-4 justify-center text-muted">{icon}</span>}
      <span className="flex-1">{children}</span>
      <ChevronRight size={14} className="text-muted" />
    </M.SubTrigger>
  );
}

export function MenuSubContent(props: React.ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent sideOffset={4} className={contentClass} {...props} />
    </M.Portal>
  );
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <M.Label className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">
      {children}
    </M.Label>
  );
}
