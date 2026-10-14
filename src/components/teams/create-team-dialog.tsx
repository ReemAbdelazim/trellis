"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCreateTeam } from "@/lib/queries/teams";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ColorSwatches, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/utils";
import { routes } from "@/lib/routes";

export function CreateTeamDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const create = useCreateTeam();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("teal");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const team = await create.mutateAsync({ name: name.trim(), description: description.trim(), color });
      toast.success(`Team “${team.name}” created`);
      onOpenChange(false);
      setName("");
      setDescription("");
      setColor("teal");
      router.push(routes.team(team.id));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create team"
      description="Teams group people and projects. You'll be the team's admin."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="create-team" disabled={!name.trim() || create.isPending}>
            {create.isPending && <Spinner size={14} className="text-current" />}
            Create team
          </Button>
        </>
      }
    >
      <form id="create-team" onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="team-name">Team name</Label>
          <Input
            id="team-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Youth programs"
            maxLength={80}
          />
        </div>
        <div>
          <Label htmlFor="team-description">Description</Label>
          <Textarea
            id="team-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this team work on?"
            rows={3}
            maxLength={500}
          />
        </div>
        <div>
          <Label>Color</Label>
          <ColorSwatches value={color} onChange={setColor} />
        </div>
      </form>
    </Dialog>
  );
}
