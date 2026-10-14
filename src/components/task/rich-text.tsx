"use client";

import { Fragment } from "react";
import { useProfileMap } from "@/lib/queries/people";

/** Mentions are stored inline as @[Display Name](user-uuid). */
export const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g;
const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'")\]])/g;

export function extractMentions(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[2]))];
}

/** Plain-text version (for previews and emails). */
export function mentionsToPlain(body: string) {
  return body.replace(MENTION_RE, "@$1");
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/** Renders user text with @mentions and links; preserves line breaks. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const people = useProfileMap();
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    if (start > last) nodes.push(<Linkified key={`t${last}`} text={text.slice(last, start)} />);
    const person = people.get(m[2]);
    nodes.push(
      <span key={`m${start}`} className="rounded bg-accent-soft px-1 font-medium text-accent">
        @{person?.full_name ?? m[1]}
      </span>,
    );
    last = start + m[0].length;
  }
  if (last < text.length) nodes.push(<Linkified key={`t${last}`} text={text.slice(last)} />);
  return <div className={className ?? "text-sm leading-relaxed break-words whitespace-pre-wrap"}>{nodes}</div>;
}
