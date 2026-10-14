"use client";

import { useRef, useState } from "react";
import { Download, File as FileIcon, FileImage, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMe } from "@/lib/queries/me";
import { attachmentUrl, useAttachments, useDeleteAttachment, useUploadAttachment } from "@/lib/queries/task-detail";
import { cn, errorMessage, formatBytes, timeAgo } from "@/lib/utils";
import { Spinner } from "@/components/ui/misc";
import type { Attachment } from "@/types/models";

export function TaskAttachments({ taskId, canAttach, canEdit }: { taskId: string; canAttach: boolean; canEdit: boolean }) {
  const me = useMe();
  const { data: files = [] } = useAttachments(taskId);
  const upload = useUploadAttachment(taskId);
  const del = useDeleteAttachment(taskId);
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const uploadAll = (list: FileList | null) => {
    if (!list) return;
    Array.from(list).forEach((file) => upload.mutate({ file, uploaderId: me.id }));
  };

  const open = async (a: Attachment, download: boolean) => {
    // Open the tab during the click; Safari blocks windows opened after an await.
    const tab = download ? null : window.open("", "_blank");
    try {
      const url = await attachmentUrl(a, download);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
    } catch (err) {
      tab?.close();
      toast.error(errorMessage(err));
    }
  };

  if (!files.length && !canAttach) return null;

  return (
    <div
      onDragOver={(e) => {
        if (!canAttach) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (canAttach) uploadAll(e.dataTransfer.files);
      }}
      className={cn("rounded-md", dragging && "ring-2 ring-accent")}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">
          Attachments{files.length > 0 && <span className="ml-1.5 font-normal text-faint">{files.length}</span>}
        </h3>
        {canAttach && (
          <button
            onClick={() => input.current?.click()}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
          >
            {upload.isPending ? <Spinner size={12} /> : <Paperclip size={13} />} Attach
          </button>
        )}
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            uploadAll(e.target.files);
            e.target.value = ""; // allow picking the same file again
          }}
        />
      </div>
      {files.length > 0 ? (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {files.map((a) => (
            <li key={a.id} className="group flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
              <span className="text-muted">
                {a.mime_type?.startsWith("image/") ? <FileImage size={18} /> : <FileIcon size={18} />}
              </span>
              <button onClick={() => open(a, false)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[13px] hover:underline">{a.file_name}</span>
                <span className="block text-[11px] text-faint">
                  {formatBytes(a.size_bytes)} · {timeAgo(a.created_at)}
                </span>
              </button>
              <button onClick={() => open(a, true)} className="rounded p-1 text-faint hover:bg-surface-2 hover:text-text" aria-label="Download">
                <Download size={14} />
              </button>
              {(canEdit || a.uploader_id === me.id) && (
                <button
                  onClick={() => del.mutate(a)}
                  className="rounded p-1 text-faint opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-danger"
                  aria-label="Delete attachment"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        canAttach && <p className="text-xs text-faint">Drop files here or click Attach (up to 50 MB each).</p>
      )}
    </div>
  );
}
