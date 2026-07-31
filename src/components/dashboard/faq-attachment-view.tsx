import { DownloadIcon, FileTextIcon, PaperclipIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatFileSize,
  isImageAttachment,
  type FaqAttachment,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   FAQ attachments, as a reader sees them.

   Split by kind rather than listed together: a screenshot answers the question by
   being looked at, so it belongs in the article. A PDF answers it by being opened
   later, so it belongs in a list at the end with its name and size visible before
   the click.

   Images use `?inline=1`, which the download route honours only for raster formats —
   the storage allow-list has no SVG, so nothing reachable here can carry script.
   Everything else keeps `Content-Disposition: attachment`.
   ────────────────────────────────────────────────────────────────────────── */

export function FaqImages({ attachments }: { attachments: FaqAttachment[] }) {
  const images = attachments.filter(isImageAttachment);
  if (images.length === 0) return null;

  return (
    <div
      className={
        images.length === 1
          ? "grid gap-3"
          : "grid gap-3 sm:grid-cols-2"
      }
    >
      {images.map((image) => (
        <figure
          key={image.fileId}
          className="overflow-hidden rounded-2xl border border-border bg-background"
        >
          {/* Plain <img>: next/image would want a configured loader for an
              authenticated route, and these are already size-bounded uploads. */}
          <img
            src={`/api/uploads/${image.fileId}?inline=1`}
            alt={image.name}
            loading="lazy"
            className="max-h-96 w-full bg-card object-contain"
          />
          <figcaption className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{image.name}</span>
            <span className="shrink-0">{formatFileSize(image.size)}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function FaqFiles({ attachments }: { attachments: FaqAttachment[] }) {
  const files = attachments.filter((entry) => !isImageAttachment(entry));
  if (files.length === 0) return null;

  return (
    <section className="grid gap-3">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <PaperclipIcon className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        Anhänge
      </h2>
      <ul className="grid gap-2">
        {files.map((file) => (
          <li
            key={file.fileId}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
              <FileTextIcon className="size-4" strokeWidth={1.5} />
            </span>
            <span className="min-w-40 flex-1">
              <span className="block truncate text-sm">{file.name}</span>
              <span className="block text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </span>
            </span>
            <Button
              asChild
              size="sm"
              className="h-9 shrink-0 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            >
              {/* Not a Next <Link>: this is a file response, not a route, and the
                  router would try to treat it as a navigation. */}
              <a href={`/api/uploads/${file.fileId}`} download>
                <DownloadIcon strokeWidth={1.5} />
                Herunterladen
              </a>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
