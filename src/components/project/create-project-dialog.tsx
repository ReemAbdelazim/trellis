"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Globe, Lock, Users } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { ColorSwatches, Spinner } from "@/components/ui/misc";
import { useMe } from "@/lib/queries/me";
import { useCreateProject, useDuplicateProject, useProjects } from "@/lib/queries/projects";
import { useTeams } from "@/lib/queries/people";
import { cn, errorMessage } from "@/lib/utils";
import type { ProjectPrivacy } from "@/types/models";
import { routes } from "@/lib/routes";

const PRIVACY: { value: ProjectPrivacy; label: string; hint: string; icon: React.ReactNode }[] = [
  { value: "public", label: "Workspace", hint: "Everyone in the workspace can find and edit", icon: <Globe size={15} /> },
  { value: "team", label: "Team", hint: "Members of the selected team", icon: <Users size={15} /> },
  { value: "private", label: "Private", hint: "Only people you invite", icon: <Lock size={15} /> },
];

const VIEWS = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
  { value: "timeline", label: "Timeline" },
  { value: "calendar", label: "Calendar" },
];

export function CreateProjectDialog({
  open,
  onOpenChange,
  defaultTeamId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultTeamId?: string;
}) {
  const me = useMe();
  const router = useRouter();
  const { data: teams = [] } = useTeams();
  const { data: projects = [] } = useProjects();
  const templates = projects.filter((p) => p.is_template && !p.archived);
  const create = useCreateProject();
  const duplicate = useDuplicateProject();

  const [name, setName] = useState("");
  const [color, setColor] = useState("teal");
  const [privacy, setPrivacy] = useState<ProjectPrivacy>("public");
  const [teamId, setTeamId] = useState(defaultTeamId ?? "");
  const [view, setView] = useState("list");
  const [templateId, setTemplateId] = useState("");

  const pending = create.isPending || duplicate.isPending;

  const reset = () => {
    setName("");
    setColor("teal");
    setPrivacy("public");
    setTeamId(defaultTeamId ?? "");
    setView("list");
    setTemplateId("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      let id: string;
      if (templateId) {
        id = await duplicate.mutateAsync({ projectId: templateId, name: name.trim(), includeTasks: true });
      } else {
        const project = await create.mutateAsync({
          name: name.trim(),
          color,
          privacy,
          team_id: teamId || null,
          default_view: view,
          created_by: me.id,
          owner_id: me.id,
        });
        id = project.id;
      }
      onOpenChange(false);
      reset();
      router.push(routes.project(id));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New project"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="create-project" disabled={!name.trim() || pending}>
            {pending && <Spinner size={14} className="text-current" />}
            Create project
          </Button>
        </>
      }
    >
      <form id="create-project" onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="project-name">Project name</Label>
          <Input id="project-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring leadership retreat" />
        </div>

        {templates.length > 0 && (
          <div>
            <Label htmlFor="project-template">Start from</Label>
            <Select id="project-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Blank project</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  Template: {t.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {!templateId && (
          <>
            <div>
              <Label>Color</Label>
              <ColorSwatches value={color} onChange={setColor} />
            </div>
            <div>
              <Label>Who can access</Label>
              <div className="grid gap-1.5">
                {PRIVACY.map((p) => (
                  <button
                    type="button"
                    key={p.value}
                    onClick={() => setPrivacy(p.value)}
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-3 py-2 text-left",
                      privacy === p.value ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2",
                    )}
                  >
                    <span className="text-muted">{p.icon}</span>
                    <span>
                      <span className="block text-sm font-medium">{p.label}</span>
                      <span className="block text-xs text-muted">{p.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="project-team">Team</Label>
                <Select id="project-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">No team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="project-view">Default view</Label>
                <Select id="project-view" value={view} onChange={(e) => setView(e.target.value)}>
                  {VIEWS.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {privacy === "team" && !teamId && (
              <p className="text-xs text-warning">Pick a team, or everyone in the workspace will have access.</p>
            )}
          </>
        )}
      </form>
    </Dialog>
  );
}
