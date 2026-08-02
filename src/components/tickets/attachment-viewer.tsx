"use client";

import { DownloadIcon } from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

/* ──────────────────────────────────────────────────────────────────────────
   Attachments, larger.

   A screenshot in a reply is capped at `max-h-80` so one image cannot take the
   whole thread, which is right for reading and useless for the case the image was
   sent for: an error dialog whose text is the point. Clicking it now opens it at
   full size, with the download beside it.

   **Event delegation, because the markup is not ours to annotate.** A comment body
   is stored HTML rendered through `dangerouslySetInnerHTML` — there is no element
   here to hang an `onClick` on, and adding one would mean rewriting the stored
   markup on every render. A click handler on the wrapper sees the same events by
   bubbling, and it is the only approach that also covers a mailed-in message,
   whose markup this application never authored.

   What is recognised is deliberately narrow — an `<img>` or an `<a>` pointing at
   `/api/uploads/<id>`, nothing else:

   - Images open in place. There is no default action to lose.
   - A PDF opens in place too, and that is the reason the download route learned
     `?inline=1` for `application/pdf`.
   - **Every other file keeps its plain download.** A .docx or a .zip has no
     preview worth a modal, and intercepting the click to say so would replace a
     working download with a dialog that explains itself.

   Modified clicks are left alone throughout: Ctrl-click on an attachment still
   means "new tab" to the person who pressed it, and a viewer that swallows that is
   a viewer people work around.
   ────────────────────────────────────────────────────────────────────────── */

/** `/api/uploads/<id>`, with or without the inline flag. Nothing else. */
const UPLOAD_HREF = /^\/api\/uploads\/([A-Za-z0-9-]+)(?:\?inline=1)?$/;

interface Viewed {
  fileId: string;
  name: string;
  kind: "image" | "pdf";
}

export function AttachmentViewer({ children }: { children: ReactNode }) {
  const [viewed, setViewed] = useState<Viewed | null>(null);

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    // Anything but a plain left click keeps the meaning the browser gives it.
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

    const target = event.target as HTMLElement | null;
    const element = target?.closest?.("img, a");
    if (!element) return;

    const source =
      element instanceof HTMLImageElement
        ? element.getAttribute("src")
        : element.getAttribute("href");
    const fileId = source?.match(UPLOAD_HREF)?.[1];
    if (!fileId) return;

    if (element instanceof HTMLImageElement) {
      event.preventDefault();
      setViewed({
        fileId,
        // `alt` when the markup carries one — a mailed-in image usually does, an
        // inserted screenshot does not. The dialog needs a title either way.
        name: element.getAttribute("alt")?.trim() || "Bild",
        kind: "image",
      });
      return;
    }

    /*
     * A link's file type comes from its text, which is the file name the composer
     * wrote there. Checked rather than assumed: everything that is not a PDF stays
     * an ordinary download, so a wrong guess here costs nothing.
     */
    const name = element.textContent?.trim() || "Datei";
    if (!/\.pdf$/i.test(name)) return;
    event.preventDefault();
    setViewed({ fileId, name, kind: "pdf" });
  };

  return (
    <div onClick={onClick}>
      {children}

      <Dialog
        open={viewed !== null}
        onOpenChange={(open) => {
          if (!open) setViewed(null);
        }}
      >
        {viewed && (
          /*
           * Wider and taller than a normal dialog: this one exists to make
           * something legible, and `sm:max-w-sm` would show the image at roughly
           * the size the bubble already did.
           */
          <DialogContent className="w-full gap-3 sm:max-w-4xl">
            {/* `pr-9` leaves the close button its corner. */}
            <div className="flex items-center gap-3 pr-9">
              <DialogTitle className="min-w-0 flex-1 truncate">
                {viewed.name}
              </DialogTitle>
              <Button
                asChild
                size="sm"
                className="h-8 shrink-0 rounded-full bg-surface-elevated px-3 text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {/*
                  Not a Next <Link>: this is a file response, not a route, and the
                  router would try to treat it as a navigation. Without
                  `?inline=1` the route answers with
                  `Content-Disposition: attachment`, so this is a download even
                  for the file shown above it.
                */}
                <a href={`/api/uploads/${viewed.fileId}`} download>
                  <DownloadIcon strokeWidth={1.5} />
                  Herunterladen
                </a>
              </Button>
            </div>

            {viewed.kind === "image" ? (
              // Plain <img>: next/image would want a configured loader for an
              // authenticated route, and these are already size-bounded uploads.
              <img
                src={`/api/uploads/${viewed.fileId}?inline=1`}
                alt={viewed.name}
                className="max-h-[75vh] w-full rounded-xl bg-card object-contain"
              />
            ) : (
              /*
               * The browser's own PDF viewer. Deliberately not a bundled one:
               * pdf.js is a megabyte of JavaScript to reproduce something every
               * target browser already ships, and it would still be reading the
               * same route.
               */
              <iframe
                src={`/api/uploads/${viewed.fileId}?inline=1#view=FitH`}
                title={viewed.name}
                className="h-[75vh] w-full rounded-xl border border-border bg-card"
              />
            )}
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
