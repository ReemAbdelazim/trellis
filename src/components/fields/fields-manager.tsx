"use client";

import { useState } from "react";
import { Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, EmptyState, Spinner } from "@/components/ui/misc";
import { useCustomFields } from "@/lib/queries/fields";
import { useDeleteField, useUpdateField } from "@/lib/queries/field-admin";
import { ruleActions, ruleTriggerConfig, useRules } from "@/lib/queries/rules";
import type { CustomField } from "@/types/models";
import { FieldDialog } from "./field-dialog";
import { fieldOptions, FieldTypeIcon, fieldTypeMeta, formatNumber, getFieldConfig, OptionPill } from "./field-meta";
import { ManagerCard, ReorderButtons } from "./manager-bits";

export function FieldsManager({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const { data: fields = [], isLoading } = useCustomFields(projectId);
  const { data: rules = [] } = useRules(projectId);
  const update = useUpdateField(projectId);
  const del = useDeleteField(projectId);

  // `dialogKey` remounts the dialog so its draft state starts fresh for each field.
  const [dialog, setDialog] = useState<{ field: CustomField | null; key: number } | null>(null);
  const [confirm, setConfirm] = useState<CustomField | null>(null);

  const rulesUsing = (fieldId: string) =>
    rules.filter(
      (r) =>
        (r.trigger_type === "field_changed" && ruleTriggerConfig(r).field_id === fieldId) ||
        ruleActions(r).some((a) => a.type === "set_field" && a.field_id === fieldId),
    );

  const confirmRules = confirm ? rulesUsing(confirm.id) : [];

  return (
    <ManagerCard
      id="workflow-fields"
      title="Custom fields"
      description="Extra columns every task in this project can fill in."
      action={
        canEdit && (
          <Button variant="primary" onClick={() => setDialog({ field: null, key: Date.now() })}>
            <Plus size={14} /> Add field
          </Button>
        )
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : fields.length === 0 ? (
        <EmptyState
          className="py-10"
          icon={<SlidersHorizontal size={28} />}
          title="No custom fields yet"
          description="Add fields like Priority, Budget or Grant stage to track what matters for this project."
        />
      ) : (
        <ul className="divide-y divide-border">
          {fields.map((f, i) => (
            <li key={f.id} className="flex min-h-12 items-center gap-3 px-4 py-2">
              <FieldTypeIcon type={f.type} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{f.name}</div>
                <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                  <span className="shrink-0">{fieldTypeMeta(f.type).label}</span>
                  <FieldSummary field={f} />
                </div>
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <ReorderButtons
                    items={fields}
                    index={i}
                    label={f.name}
                    onMove={(position) => update.mutate({ id: f.id, position })}
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit ${f.name}`}
                    onClick={() => setDialog({ field: f, key: Date.now() })}
                  >
                    <Pencil size={13} />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${f.name}`} onClick={() => setConfirm(f)}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <FieldDialog
          key={dialog.key}
          projectId={projectId}
          field={dialog.field}
          open
          onOpenChange={(o) => !o && setDialog(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete “${confirm?.name ?? ""}”?`}
        description={
          <>
            <p>The field and its values on every task will be permanently deleted.</p>
            {confirmRules.length > 0 && (
              <p className="mt-2 text-warning">
                {confirmRules.length === 1 ? "1 rule uses" : `${confirmRules.length} rules use`} this field (
                {confirmRules.map((r) => r.name).join(", ")}) and will stop working until edited.
              </p>
            )}
          </>
        }
        pending={del.isPending}
        onConfirm={() => {
          if (confirm) del.mutate(confirm.id, { onSettled: () => setConfirm(null) });
        }}
      />
    </ManagerCard>
  );
}

function FieldSummary({ field }: { field: CustomField }) {
  if (field.type === "single_select" || field.type === "multi_select") {
    const opts = fieldOptions(field);
    const shown = opts.slice(0, 4);
    return (
      <span className="hidden min-w-0 items-center gap-1 overflow-hidden sm:flex">
        <span aria-hidden>·</span>
        {shown.map((o) => (
          <OptionPill key={o.id} option={o} className="max-w-[7rem] shrink" />
        ))}
        {opts.length > shown.length && <span className="shrink-0">+{opts.length - shown.length}</span>}
      </span>
    );
  }
  if (field.type === "number") {
    const c = getFieldConfig(field);
    return (
      <span className="truncate">
        · e.g. <span className="tabular-nums">{formatNumber(1200, c)}</span>
      </span>
    );
  }
  return null;
}
