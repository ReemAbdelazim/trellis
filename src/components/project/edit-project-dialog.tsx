"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ColorSwatches } from "@/components/ui/misc";
import { DatePicker } from "@/components/ui/date-picker";
import { UserPicker } from "@/components/ui/user-picker";
import { Avatar } from "@/components/ui/avatar";
import { useProfile, useTeams } from "@/lib/queries/people";
import { useUpdateProject } from "@/lib/queries/projects";
import { errorMessage, formatDateRange } from "@/lib/utils";
import type { Project } from "@/types/models";

/** Mount only while open so the form starts from the latest project. */
export function EditProjectDialog({
  open,
  onOpenChange,
  project,
  isOwner,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project: Project;
  isOwner: boolean;
}) {
  const update = useUpdateProject();
  const { data: teams = [] } = useTeams();
  const [form, setForm] = useState(project);
  const owner = useProfile(form.owner_id);

  const save = async () => {
    try {
      await update.mutateAsync({
        id: project.id,
        name: form.name.trim() || project.name,
        description: form.description,
        color: form.color,
        default_view: form.default_view,
        start_date: form.start_date,
        due_date: form.due_date,
        ...(isOwner ? { team_id: form.team_id, owner_id: form.owner_id, is_template: form.is_template } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Project details"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={update.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="ep-name">Name</Label>
          <Input id="ep-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="ep-desc">Description</Label>
          <Textarea id="ep-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <Label>Color</Label>
          <ColorSwatches value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Owner</Label>
            <UserPicker value={form.owner_id} allowClear={false} disabled={!isOwner} onChange={(id) => setForm({ ...form, owner_id: id })}>
              <button type="button" className="flex h-9 w-full items-center gap-2 rounded-md border border-border px-2 text-sm disabled:opacity-60" disabled={!isOwner}>
                <Avatar profile={owner} size="xs" />
                <span className="truncate">{owner?.full_name ?? "No owner"}</span>
              </button>
            </UserPicker>
          </div>
          <div>
            <Label>Dates</Label>
            <DatePicker
              due={form.due_date}
              start={form.start_date}
              onChange={({ due, start }) => setForm({ ...form, due_date: due, start_date: start })}
            >
              <button type="button" className="flex h-9 w-full items-center rounded-md border border-border px-3 text-left text-sm">
                {formatDateRange(form.start_date, form.due_date) || <span className="text-faint">No dates</span>}
              </button>
            </DatePicker>
          </div>
          <div>
            <Label htmlFor="ep-team">Team</Label>
            <Select id="ep-team" value={form.team_id ?? ""} disabled={!isOwner} onChange={(e) => setForm({ ...form, team_id: e.target.value || null })}>
              <option value="">No team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ep-view">Default view</Label>
            <Select id="ep-view" value={form.default_view} onChange={(e) => setForm({ ...form, default_view: e.target.value })}>
              {["overview", "list", "board", "timeline", "calendar", "dashboard"].map((v) => (
                <option key={v} value={v} className="capitalize">
                  {v[0].toUpperCase() + v.slice(1)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {isOwner && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_template} onChange={(e) => setForm({ ...form, is_template: e.target.checked })} />
            Use as a template (shows up in “Start from” when creating projects)
          </label>
        )}
      </div>
    </Dialog>
  );
}
