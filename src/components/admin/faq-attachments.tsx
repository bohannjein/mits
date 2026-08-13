"use client";

import {
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  PaperclipIcon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatFileSize,
  isImageAttachment,
  type FaqAttachment,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Attachments for one FAQ article.

   Files go to `/api/admin/faq-upload`, which stores them with `scope: "faq"` —
   readable by every signed-in user, unlike a ticket attachment. That endpoint is
   admin-only and there is no way to re-scope an existing upload, so publishing is
   always a deliberate act rather than a relabelling.

   Removing an entry here detaches it from the article; the blob stays on disk. That
   is deliberate for now: a stored file may still be referenced by an article an
   admin is editing in another tab, and deleting on detach would break it. Orphans
   are a housekeeping problem, a broken published article is a visible one.
   ────────────────────────────────────────────────────────────────────────── */

const ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.bmp,.pdf,.txt,.log,.csv,.zip,.docx,.xlsx";

export function FaqAttachments({
  attachments,
  onChange,
  disabled = false,
  /**
   * The configured ceiling in MB, passed down rather than hardcoded: it is an admin
   * setting now, and a hint that says 10 MB while the limit is 50 is worse than no hint.
   */
  maxUploadMb,
}: {
  attachments: FaqAttachment[];
  onChange: (next: FaqAttachment[]) => void;
  disabled?: boolean;
  maxUploadMb: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);

    const body = new FormData();
    for (const file of files) body.append("files", file);

    try {
      const response = await fetch("/api/admin/faq-upload", {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as {
        uploads?: { id: string; name: string; size: number; type: string }[];
        error?: string;
      };
      if (!response.ok) {
        // The endpoint names the reason — wrong type, too large — so it is passed
        // through rather than replaced with a generic failure.
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      onChange([
        ...attachments,
        ...(payload.uploads ?? []).map((entry) => ({
          fileId: entry.id,
          name: entry.name,
          size: entry.size,
          type: entry.type,
        })),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
      // Same file twice in a row would otherwise not fire a change event.
      if (input.current) input.current.value = "";
    }
  };

  const remove = (fileId: string) =>
    onChange(attachments.filter((entry) => entry.fileId !== fileId));

  return (
    <div className="grid gap-3">
      {/* Third copy of the drag handling that `FileDropzone` owns, and it had the
          same naive `onDragLeave` as the CMDB import: the highlight dropped out as
          soon as the pointer crossed the icon or either line of text. */}
      <FileDropzone
        onFiles={(incoming) => void upload(incoming)}
        disabled={disabled || uploading}
        className="rounded-2xl"
      >
        <div
          className={cn(
            "grid justify-items-center gap-2 rounded-2xl border border-dashed border-border bg-background px-4 py-6 text-center transition-colors",
            (disabled || uploading) && "opacity-60",
          )}
        >
        <span className="grid size-10 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
          {uploading ? (
            <Loader2Icon className="size-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <UploadIcon className="size-4" strokeWidth={1.5} />
          )}
        </span>
        <p className="text-sm">
          {uploading ? "Wird hochgeladen …" : "Dateien hierher ziehen"}
        </p>
        <p className="text-xs text-muted-foreground">
          Bilder, PDF und Dokumente · max. {maxUploadMb} MB je Datei
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => input.current?.click()}
          className="mt-1 h-8 rounded-full px-3"
        >
          <PaperclipIcon strokeWidth={1.5} />
          Auswählen
        </Button>
        <Input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          disabled={disabled || uploading}
          onChange={(event) => void upload(Array.from(event.target.files ?? []))}
          className="hidden"
          aria-label="Dateien für diesen FAQ-Beitrag"
        />
        </div>
      </FileDropzone>

      {error && (
        <p className="flex items-center gap-2 text-xs font-medium text-destructive">
          <TriangleAlertIcon className="size-3.5 shrink-0" strokeWidth={1.5} />
          {error}
        </p>
      )}

      {attachments.length > 0 && (
        <ul className="grid gap-2">
          {attachments.map((attachment) => {
            const image = isImageAttachment(attachment);
            return (
              <li
                key={attachment.fileId}
                className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-elevated text-muted-foreground">
                  {image ? (
                    <ImageIcon className="size-4" strokeWidth={1.5} />
                  ) : (
                    <FileTextIcon className="size-4" strokeWidth={1.5} />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {attachment.name}
                </span>
                <Badge
                  variant="outline"
                  className="shrink-0 rounded-full text-[11px] font-normal"
                >
                  {formatFileSize(attachment.size)}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${attachment.name} entfernen`}
                  disabled={disabled || uploading}
                  onClick={() => remove(attachment.fileId)}
                  className="rounded-full"
                >
                  <XIcon strokeWidth={1.5} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
