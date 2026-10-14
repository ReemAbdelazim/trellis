"use client";

import { forwardRef, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-faint",
          "focus:border-accent focus:ring-2 focus:ring-[var(--ring)] focus:outline-none disabled:opacity-60",
          className,
        )}
        {...props}
      />
    );
  },
);

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoGrow?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, autoGrow = true, value, ...props },
  forwarded,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || !autoGrow) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value, autoGrow]);
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof forwarded === "function") forwarded(el);
        else if (forwarded) forwarded.current = el;
      }}
      value={value}
      className={cn(
        "w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-faint",
        "focus:border-accent focus:ring-2 focus:ring-[var(--ring)] focus:outline-none",
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-xs font-medium text-muted", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-text focus:border-accent focus:ring-2 focus:ring-[var(--ring)] focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
