"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { UserPicker } from "@/components/ui/user-picker";
import { Avatar } from "@/components/ui/avatar";
import { useMe } from "@/lib/queries/me";
import { useProfile } from "@/lib/queries/people";
import { useProjects } from "@/lib/queries/projects";
import { newId, useCreateTask } from "@/lib/queries/tasks";
import { useTaskPane } from "@/lib/task-pane";
import { formatDue } from "@/lib/utils";

/** Global "Create → Task" dialog. */
export function QuickAddTaskDialog({
  open,
  onOpenChange,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultProjectId?: string;
}) {
  const me = useMe();
  const { data: projects = [] } = useProjects();
  const create = useCreateTask();
  const { openTask } = useTaskPane();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [assigneeId, setAssigneeId] = useState<string | null>(me.id);
  const [due, setDue] = useState<string | null>(null);
  const assignee = useProfile(assigneeId);

  const usable = projects.filter((p) => !p.archived && !p.is_template);

  const submit = async (e: React.FormEvent, openAfter = false) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = newId();
    try {
      await create.mutateAsync({
        id,
        name: name.trim(),
        project_id: projectId || null,
        assignee_id: assigneeId,
        due_date: due,
        created_by: me.id,
      });
      toast.success("Task created", { action: { label: "Open", onClick: () => openTask(id) } });
      setName("");
      setDue(null);
      onOpenChange(false);
      if (openAfter) openTask(id);
    } catch {
      /* toast shown by mutation */
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New task"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="quick-add-task" disabled={!name.trim()}>
            Create task
          </Button>
        </>
      }
    >
      <form id="quick-add-task" onSubmit={submit} className="space-y-4">
        <Input autoFocus placeholder="Task name" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Assignee</Label>
            <UserPicker value={assigneeId} onChange={setAssigneeId}>
              <button type="button" className="flex h-9 w-full items-center gap-2 rounded-md border border-border px-2 text-sm hover:bg-surface-2">
                <Avatar profile={assignee} size="sm" />
                <span className="truncate">{assignee?.full_name ?? "Unassigned"}</span>
              </button>
            </UserPicker>
          </div>
          <div>
            <Label>Due date</Label>
            <DatePicker due={due} allowStart={false} onChange={({ due }) => setDue(due)}>
              <button type="button" className="flex h-9 w-full items-center rounded-md border border-border px-3 text-left text-sm hover:bg-surface-2">
                {due ? formatDue(due) : <span className="text-faint">No due date</span>}
              </button>
            </DatePicker>
          </div>
        </div>
        <div>
          <Label htmlFor="quick-project">Project</Label>
          <Select id="quick-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project (only visible to you and the assignee)</option>
            {usable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </form>
    </Dialog>
  );
}
