"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ColorSwatches, Spinner } from "@/components/ui/misc";
import { useCreateField, useUpdateField } from "@/lib/queries/field-admin";
import { cn, colorHex, PALETTE } from "@/lib/utils";
import type { CustomField, FieldConfig, FieldOption, FieldType } from "@/types/models";
import { clampPrecision, FIELD_TYPES, fieldOptions, fieldTypeMeta, formatNumber, getFieldConfig } from "./field-meta";

const newOption = (index: number, name = ""): FieldOption => ({
  id: crypto.randomUUID(),
  name,
  color: PALETTE[index % PALETTE.length],
});

/** Add (field = null) or edit a custom field. Mount with a `key` so state resets per field. */
export function FieldDialog({
  projectId,
  field,
  open,
  onOpenChange,
}: {
  projectId: string;
  field: CustomField | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateField(projectId);
  const update = useUpdateField(projectId);
  const initialConfig = field ? getFieldConfig(field) : {};
  const originalOptions = field ? fieldOptions(field) : [];

  const [name, setName] = useState(field?.name ?? "");
  const [type, setType] = useState<FieldType>(field?.type ?? "single_select");
  const [options, setOptions] = useState<FieldOption[]>(() =>
    field ? originalOptions.map((o) => ({ ...o })) : [newOption(0, "Low"), newOption(4, "Medium"), newOption(5, "High")],
  );
  const [precision, setPrecision] = useState(clampPrecision(initialConfig.precision));
  const [unit, setUnit] = useState(initialConfig.unit ?? "");
  const [submitted, setSubmitted] = useState(false);

  const isSelect = type === "single_select" || type === "multi_select";
  const removed = originalOptions.filter((o) => !options.some((x) => x.id === o.id));

  const errors: string[] = [];
  if (!name.trim()) errors.push("Give the field a name.");
  if (isSelect) {
    if (options.length === 0) errors.push("Add at least one option.");
    if (options.some((o) => !o.name.trim())) errors.push("Every option needs a name.");
    const names = options.map((o) => o.name.trim().toLowerCase()).filter(Boolean);
    if (new Set(names).size !== names.length) errors.push("Option names must be unique.");
  }
  if (type === "number" && unit.trim().length > 8) errors.push("Keep the unit to 8 characters or fewer.");

  const pending = create.isPending || update.isPending;

  const save = () => {
    setSubmitted(true);
    if (errors.length) return;
    const config: FieldConfig = isSelect
      ? { options: options.map((o) => ({ id: o.id, name: o.name.trim(), color: o.color })) }
      : type === "number"
        ? { precision, ...(unit.trim() ? { unit: unit.trim() } : {}) }
        : {};
    if (field) {
      update.mutate(
        {
          id: field.id,
          name: name.trim(),
          config,
          removedOptionIds: removed.map((o) => o.id),
        },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      create.mutate({ name: name.trim(), type, config }, { onSuccess: () => onOpenChange(false) });
    }
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j], next[i]];
    setOptions(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={field ? "Edit field" : "Add custom field"}
      description={field ? fieldTypeMeta(field.type).label : "Track extra information on every task in this project."}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={pending}>
            {pending && <Spinner size={14} className="text-current" />}
            {field ? "Save" : "Add field"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div>
          <Label htmlFor="field-name">Name</Label>
          <Input
            id="field-name"
            autoFocus
            value={name}
            maxLength={60}
            placeholder="e.g. Priority, Budget, Grant stage"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {!field && (
          <div>
            <Label htmlFor="field-type">Type</Label>
            <Select id="field-type" value={type} onChange={(e) => setType(e.target.value as FieldType)}>
              {FIELD_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label} — {t.hint}
                </option>
              ))}
            </Select>
          </div>
        )}

        {isSelect && (
          <div>
            <Label>Options</Label>
            <ul className="space-y-1.5">
              {options.map((o, i) => (
                <li key={o.id} className="flex items-center gap-1.5">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Colour for ${o.name || "option"}`}
                        className="h-7 w-7 shrink-0 rounded-md border border-border"
                        style={{ background: colorHex(o.color) }}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-[188px]">
                      <ColorSwatches
                        value={o.color}
                        onChange={(c) => setOptions(options.map((x) => (x.id === o.id ? { ...x, color: c } : x)))}
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    value={o.name}
                    maxLength={40}
                    aria-label={`Option ${i + 1} name`}
                    placeholder={`Option ${i + 1}`}
                    autoFocus={!o.name && i === options.length - 1 && i > 2}
                    className={cn("h-8", submitted && !o.name.trim() && "border-danger")}
                    onChange={(e) => setOptions(options.map((x) => (x.id === o.id ? { ...x, name: e.target.value } : x)))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (i === options.length - 1) setOptions([...options, newOption(options.length)]);
                      }
                    }}
                  />
                  <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp size={13} />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Move down"
                    disabled={i === options.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={13} />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${o.name || "option"}`}
                    onClick={() => setOptions(options.filter((x) => x.id !== o.id))}
                  >
                    <Trash2 size={13} />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              size="xs"
              variant="ghost"
              className="mt-2"
              onClick={() => setOptions([...options, newOption(options.length)])}
            >
              <Plus size={13} /> Add option
            </Button>
            {removed.length > 0 && (
              <div className="mt-3 flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  Removing {removed.map((o) => `“${o.name}”`).join(", ")} will clear {removed.length === 1 ? "it" : "them"}{" "}
                  from every task that uses {removed.length === 1 ? "it" : "them"}. Rules that refer to{" "}
                  {removed.length === 1 ? "this option" : "these options"} will stop matching.
                </span>
              </div>
            )}
          </div>
        )}

        {type === "number" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="field-precision">Decimal places</Label>
              <Select id="field-precision" value={precision} onChange={(e) => setPrecision(Number(e.target.value))}>
                {[0, 1, 2, 3, 4].map((p) => (
                  <option key={p} value={p}>
                    {p} — {(1).toFixed(p)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="field-unit">Unit (optional)</Label>
              <Input
                id="field-unit"
                value={unit}
                maxLength={8}
                placeholder="$, %, hrs"
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
            <p className="col-span-2 text-xs text-muted">
              Preview: <span className="text-text tabular-nums">{formatNumber(1234.5, { precision, unit })}</span>
            </p>
          </div>
        )}

        {field && <p className="text-xs text-faint">The field type can’t be changed after it’s created.</p>}

        {submitted && errors.length > 0 && (
          <ul className="space-y-0.5 text-[13px] text-danger" role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
