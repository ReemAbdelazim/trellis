"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useActiveProfiles } from "@/lib/queries/people";
import { useTaskAudience } from "@/lib/queries/task-detail";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface MentionInputHandle {
  focus: () => void;
}

/**
 * Textarea with @mention autocomplete for a task's comments. Selected people are
 * inserted as @[Name](id) tokens; the textarea shows them literally as "@Name"
 * via a parallel display string so editing stays simple and robust. People who
 * can't see the task are listed but can't be picked, so nobody is mentioned
 * without being told.
 */
export const MentionInput = forwardRef<
  MentionInputHandle,
  {
    taskId: string;
    value: string;
    onChange: (v: string) => void;
    onSubmit?: () => void;
    placeholder?: string;
    className?: string;
  }
>(function MentionInput({ taskId, value, onChange, onSubmit, placeholder, className }, ref) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const { data: people } = useActiveProfiles();
  const { data: audience } = useTaskAudience(taskId);
  const [query, setQuery] = useState<{ text: string; start: number } | null>(null);
  const [active, setActive] = useState(0);

  useImperativeHandle(ref, () => ({ focus: () => textarea.current?.focus() }));

  // Display form: tokens rendered as "@Name". We keep a mapping to rebuild tokens.
  const { display, tokens } = useMemo(() => {
    const toks: { name: string; id: string }[] = [];
    const d = value.replace(/@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g, (_m, name: string, id: string) => {
      toks.push({ name, id });
      return `@${name}`;
    });
    return { display: d, tokens: toks };
  }, [value]);

  const toStored = (text: string, added?: { name: string; id: string }) => {
    let out = text;
    // Re-tokenise known mentions (longest names first to avoid partial matches).
    const all = added ? [...tokens, added] : tokens;
    const known = [...new Map(all.map((t) => [t.name, t])).values()].sort((a, b) => b.name.length - a.name.length);
    for (const t of known) {
      const escaped = t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`@${escaped}(?![\\p{L}\\p{N}_])`, "gu"), `\u0000${t.id}\u0001${t.name}\u0002`);
    }
    return out.replace(/\u0000([^\u0001]+)\u0001([^\u0002]+)\u0002/g, (_m, id, name) => `@[${name}](${id})`);
  };

  // People who can see the task first; until access is known, assume they all can.
  const matches = useMemo(() => {
    if (!query) return [];
    const q = query.text.toLowerCase();
    return people
      .filter((p) => p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().startsWith(q))
      .map((p) => ({ ...p, allowed: !audience || audience.has(p.id) }))
      .sort((a, b) => Number(b.allowed) - Number(a.allowed))
      .slice(0, 6);
  }, [people, query, audience]);
  const pickable = matches.filter((p) => p.allowed).length;

  const detect = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = /(^|\s)@([\w.'-]{0,30})$/.exec(before);
    if (m) {
      setQuery({ text: m[2], start: caret - m[2].length - 1 });
      setActive(0);
    } else setQuery(null);
  };

  const pick = (id: string, name: string) => {
    if (!query || !textarea.current) return;
    const caret = textarea.current.selectionStart;
    const nextDisplay = `${display.slice(0, query.start)}@${name} ${display.slice(caret)}`;
    onChange(toStored(nextDisplay, { name, id }));
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = query.start + name.length + 2;
      textarea.current?.focus();
      textarea.current?.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={textarea}
        value={display}
        rows={2}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(toStored(e.target.value));
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (query && matches.length) {
            if (e.key === "ArrowDown" && pickable) {
              e.preventDefault();
              setActive((a) => (a + 1) % pickable);
              return;
            }
            if (e.key === "ArrowUp" && pickable) {
              e.preventDefault();
              setActive((a) => (a - 1 + pickable) % pickable);
              return;
            }
            if ((e.key === "Enter" || e.key === "Tab") && pickable) {
              e.preventDefault();
              const p = matches[active];
              pick(p.id, p.full_name || p.email);
              return;
            }
            if (e.key === "Escape") {
              setQuery(null);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight + 2, 240)}px`;
        }}
        className={cn(
          "w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-faint focus:border-accent focus:outline-none",
          className,
        )}
      />
      {query && matches.length > 0 && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-64 rounded-lg border border-border bg-surface p-1 shadow-pop">
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              disabled={!p.allowed}
              onMouseDown={(e) => {
                e.preventDefault();
                if (p.allowed) pick(p.id, p.full_name || p.email);
              }}
              className={cn(
                "flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60",
                i === active && p.allowed && "bg-surface-2",
              )}
            >
              <Avatar profile={p} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.full_name || p.email}</span>
                {!p.allowed && <span className="block text-[11px] text-faint">No access to this task</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
