"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Copy,
  FileStack,
  Globe,
  Lock,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { useMe } from "@/lib/queries/me";
import { useProfileMap } from "@/lib/queries/people";
import {
  useDeleteProject,
  useDuplicateProject,
  useFavorites,
  useProject,
  useProjectAccess,
  useProjectMembers,
  useToggleFavorite,
  useUpdateProject,
} from "@/lib/queries/projects";
import { useRealtime } from "@/lib/queries/realtime";
import { qk } from "@/lib/queries/keys";
import { Button } from "@/components/ui/button";
import { AvatarStack } from "@/components/ui/avatar";
import { ConfirmDialog, InlineEdit, StatusPill } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, colorHex, errorMessage } from "@/lib/utils";
import { PROJECT_VIEWS, type ProjectViewId } from "./views-config";
import { ShareProjectDialog } from "./share-project-dialog";
import { EditProjectDialog } from "./edit-project-dialog";
import { routes } from "@/lib/routes";

export function ProjectHeader({ projectId, view }: { projectId: string; view: ProjectViewId }) {
  const me = useMe();
  const router = useRouter();
  const { data: project, isLoading } = useProject(projectId);
  const { data: access } = useProjectAccess(projectId);
  const { data: members = [] } = useProjectMembers(projectId);
  const { data: favorites = [] } = useFavorites();
  const toggleFav = useToggleFavorite();
  const update = useUpdateProject();
  const del = useDeleteProject();
  const duplicate = useDuplicateProject();
  const people = useProfileMap();
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useRealtime({ table: "projects", filter: `id=eq.${projectId}`, invalidate: [qk.project(projectId)] });

  if (isLoading) return <div className="h-[92px] border-b border-border bg-surface" />;
  if (!project) {
    return (
      <div className="border-b border-border bg-surface px-6 py-10 text-center">
        <p className="font-medium">This project doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Link href="/projects" className="mt-2 inline-block text-sm text-accent hover:underline">
          Browse projects
        </Link>
      </div>
    );
  }

  const canEdit = access === "owner" || access === "editor";
  const isOwner = access === "owner";
  const isFav = favorites.includes(projectId);

  const makeCopy = async (asTemplate: boolean) => {
    try {
      const id = await duplicate.mutateAsync({
        projectId,
        name: asTemplate ? `${project.name} template` : `${project.name} (copy)`,
        asTemplate,
      });
      toast.success(asTemplate ? "Saved as a template" : "Project duplicated");
      router.push(routes.project(id));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <header className="border-b border-border bg-surface">
      <div className="flex items-center gap-3 px-4 pt-3 sm:px-6">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
          style={{ background: colorHex(project.color) }}
        >
          {project.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="min-w-0 flex-1 text-lg font-semibold sm:flex-initial">
              <InlineEdit value={project.name} disabled={!canEdit} onSave={(name) => update.mutate({ id: projectId, name })} />
            </h1>
            <Tooltip content={isFav ? "Remove from favorites" : "Add to favorites"}>
              <button
                onClick={() => toggleFav.mutate({ projectId, favorite: !isFav })}
                className="rounded p-1 text-faint hover:bg-surface-2"
                aria-label="Favorite"
                aria-pressed={isFav}
              >
                <Star size={16} className={cn(isFav && "fill-warning text-warning")} />
              </button>
            </Tooltip>
            <Tooltip content={project.privacy === "private" ? "Private" : project.privacy === "team" ? "Team" : "Workspace"}>
              <span className="hidden text-faint sm:inline">
                {project.privacy === "private" ? <Lock size={14} /> : project.privacy === "team" ? <Users size={14} /> : <Globe size={14} />}
              </span>
            </Tooltip>
            <span className="hidden shrink-0 sm:inline-flex">
              <StatusPill status={project.current_status} />
            </span>
            {project.is_template && <span className="rounded bg-info-soft px-1.5 text-[11px] font-medium text-info">Template</span>}
            {project.archived && <span className="rounded bg-surface-3 px-1.5 text-[11px] font-medium text-muted">Archived</span>}
          </div>
        </div>
        <button onClick={() => setShareOpen(true)} className="hidden rounded-full sm:block" aria-label="Project members">
          <AvatarStack profiles={members.map((m) => people.get(m.user_id))} max={4} />
        </button>
        <Button size="sm" variant="primary" onClick={() => setShareOpen(true)}>
          Share
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Project actions">
              <MoreHorizontal size={17} />
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={<Pencil size={14} />} disabled={!canEdit} onSelect={() => setEditOpen(true)}>
              Edit project details
            </MenuItem>
            {me.role !== "guest" && (
              <>
                <MenuItem icon={<Copy size={14} />} onSelect={() => makeCopy(false)}>
                  Duplicate project
                </MenuItem>
                <MenuItem icon={<FileStack size={14} />} onSelect={() => makeCopy(true)}>
                  Save as template
                </MenuItem>
              </>
            )}
            <MenuSeparator />
            <MenuItem
              icon={project.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              disabled={!canEdit}
              onSelect={() => update.mutate({ id: projectId, archived: !project.archived })}
            >
              {project.archived ? "Restore project" : "Archive project"}
            </MenuItem>
            <MenuItem icon={<Trash2 size={14} />} danger disabled={!isOwner} onSelect={() => setConfirmDelete(true)}>
              Delete project
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <nav className="mt-1 flex gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Project views">
        {PROJECT_VIEWS.map((v) => (
          <Link
            key={v.id}
            href={routes.project(projectId, v.id)}
            className={cn(
              "border-b-2 px-2 py-2 text-[13.5px] whitespace-nowrap transition-colors",
              view === v.id ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      <ShareProjectDialog open={shareOpen} onOpenChange={setShareOpen} project={project} access={access ?? null} />
      {editOpen && <EditProjectDialog open onOpenChange={setEditOpen} project={project} isOwner={isOwner} />}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${project.name}”?`}
        description="All tasks, comments, and attachments in this project will be permanently deleted. Consider archiving instead."
        pending={del.isPending}
        onConfirm={async () => {
          try {
            await del.mutateAsync(projectId);
            router.push("/projects");
          } catch (err) {
            toast.error(errorMessage(err));
          }
        }}
      />
    </header>
  );
}
