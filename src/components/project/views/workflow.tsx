"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Rows3, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog, EmptyState, InlineEdit, Spinner } from "@/components/ui/misc";
import { FieldsManager } from "@/components/fields/fields-manager";
import { ManagerCard, ReorderButtons } from "@/components/fields/manager-bits";
import { RulesManager } from "@/components/rules/rules-manager";
import {
  useCanEditProject,
  useCreateSection,
  useDeleteSection,
  useProjectAccess,
  useSections,
  useUpdateSection,
} from "@/lib/queries/projects";
import { useProjectTasks } from "@/lib/queries/tasks";
import { qk } from "@/lib/queries/keys";
import { errorMessage } from "@/lib/utils";
import type { Section } from "@/types/models";

/** Project "Workflow" tab: sections, custom fields, and rules automation. */
export function ProjectWorkflow({ projectId }: { projectId: string }) {
  const canEdit = useCanEditProject(projectId);
  const { isLoading: accessLoading } = useProjectAccess(projectId);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-5 md:px-6 md:py-6">
        {!canEdit && !accessLoading && (
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">
            <Lock size={14} className="shrink-0" />
            You can view this project’s workflow. Only project editors can change it.
          </div>
        )}
        <SectionsManager projectId={projectId} canEdit={canEdit} />
        <FieldsManager projectId={projectId} canEdit={canEdit} />
        <RulesManager projectId={projectId} canEdit={canEdit} />
      </div>
    </div>
  );
}

function SectionsManager({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: sections = [], isLoading } = useSections(projectId);
  const { data: tasks = [] } = useProjectTasks(projectId);
  const create = useCreateSection(projectId);
  const update = useUpdateSection(projectId);
  const del = useDeleteSection(projectId);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<Section | null>(null);

  const counts = new Map<string, number>();
  for (const t of tasks) if (t.section_id) counts.set(t.section_id, (counts.get(t.section_id) ?? 0) + 1);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.sections(projectId) });
    // Rules may reference sections.
    qc.invalidateQueries({ queryKey: qk.rules(projectId) });
  };

  const add = () => {
    const n = name.trim();
    if (!n) return;
    create.mutate(
      { name: n },
      {
        onSuccess: () => setName(""),
        onError: (err) => toast.error(errorMessage(err)),
        onSettled: refresh,
      },
    );
  };

  const patch = (id: string, p: Partial<Section>) =>
    update.mutate({ id, ...p }, { onError: (err) => toast.error(errorMessage(err)), onSettled: refresh });

  const confirmCount = confirm ? (counts.get(confirm.id) ?? 0) : 0;

  return (
    <ManagerCard id="workflow-sections" title="Sections" description="The stages tasks move through in list and board views.">
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : sections.length === 0 ? (
        <EmptyState className="py-8" icon={<Rows3 size={28} />} title="No sections" description="Add a section to group tasks." />
      ) : (
        <ul className="divide-y divide-border">
          {sections.map((s, i) => {
            const count = counts.get(s.id) ?? 0;
            return (
              <li key={s.id} className="flex min-h-11 items-center gap-3 px-4 py-1.5">
                <div className="min-w-0 flex-1 text-sm font-medium">
                  <InlineEdit value={s.name} disabled={!canEdit} onSave={(v) => patch(s.id, { name: v })} />
                </div>
                <span className="shrink-0 text-xs text-faint tabular-nums">
                  {count} {count === 1 ? "task" : "tasks"}
                </span>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <ReorderButtons
                      items={sections}
                      index={i}
                      label={s.name}
                      onMove={(position) => patch(s.id, { position })}
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete section ${s.name}`}
                      onClick={() => setConfirm(s)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <form
          className="flex gap-2 border-t border-border px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="New section name"
            aria-label="New section name"
            className="h-8"
          />
          <Button type="submit" disabled={!name.trim() || create.isPending}>
            <Plus size={14} /> Add
          </Button>
        </form>
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete section “${confirm?.name ?? ""}”?`}
        description={
          confirmCount > 0
            ? `Its ${confirmCount} ${confirmCount === 1 ? "task stays" : "tasks stay"} in the project without a section. Rules that use this section will stop matching.`
            : "Rules that use this section will stop matching."
        }
        pending={del.isPending}
        onConfirm={() => {
          if (!confirm) return;
          del.mutate(confirm.id, {
            onError: (err) => toast.error(errorMessage(err)),
            onSettled: () => {
              setConfirm(null);
              refresh();
            },
          });
        }}
      />
    </ManagerCard>
  );
}
