"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/input";
import { useUpdateProject } from "@/lib/queries/projects";
import { errorMessage } from "@/lib/utils";
import type { Project } from "@/types/models";

const SAVE_DELAY = 800;

/** Project description with debounced autosave (flushes on blur and unmount). */
export function ProjectDescription({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const update = useUpdateProject();
  const [draft, setDraft] = useState(project.description);
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<string | null>(null);

  // Follow remote edits while the user isn't typing here.
  const [synced, setSynced] = useState(project.description);
  if (synced !== project.description && !focused) {
    setSynced(project.description);
    setDraft(project.description);
  }

  const save = (value: string) => {
    clearTimeout(timer.current);
    pending.current = null;
    if (value === project.description) return;
    setStatus("saving");
    update.mutate(
      { id: project.id, description: value },
      {
        onSuccess: () => setStatus("saved"),
        onError: (err) => {
          setStatus("error");
          toast.error(errorMessage(err));
        },
      },
    );
  };

  // Flush an unsaved edit if the view unmounts mid-debounce.
  const flush = useRef<() => void>(() => {});
  useEffect(() => {
    flush.current = () => {
      if (pending.current !== null && pending.current !== project.description) {
        update.mutate({ id: project.id, description: pending.current });
      }
    };
  });
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      flush.current();
    },
    [],
  );

  if (!canEdit) {
    return project.description ? (
      <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{project.description}</p>
    ) : (
      <p className="text-sm text-faint">No description yet.</p>
    );
  }

  return (
    <div>
      <Textarea
        value={draft}
        aria-label="Project description"
        placeholder="What's this project about? Share goals, scope, links and anything the team should know."
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          setStatus("idle");
          pending.current = v;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => save(v), SAVE_DELAY);
        }}
        onBlur={() => {
          setFocused(false);
          if (pending.current !== null) save(pending.current);
        }}
        className="min-h-24 border-transparent bg-transparent px-2 text-[14px] leading-relaxed hover:border-border focus:bg-surface"
      />
      <div className="mt-1 h-4 px-2 text-[11.5px] text-faint" aria-live="polite">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save — keep typing to retry" : ""}
      </div>
    </div>
  );
}
