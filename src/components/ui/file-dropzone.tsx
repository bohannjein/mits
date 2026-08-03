"use client";

import { UploadIcon } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   Drop a file anywhere on this region.

   Wraps whatever it is given and shows a dashed frame while something is being
   dragged over it. The upload itself is the caller's — this component knows
   about pointers, not about tickets.

   **The counter is the whole trick.** `dragleave` also fires when the pointer
   crosses onto a *child* element, so a naive `onDragLeave={() => setDragging(false)}`
   makes the overlay flicker off the moment the cursor passes over anything
   inside the region — which is most of it. Counting enter and leave and only
   clearing at zero is what makes the state survive the internal boundaries.
   The same fix `chat-intake.tsx` already carries.

   **Only for files.** `dataTransfer.types` includes `"Files"` only when the
   drag actually carries one, so selecting a word and dragging it across the
   reply box does not put an upload overlay in front of the text.
   ────────────────────────────────────────────────────────────────────────── */

export function FileDropzone({
  onFiles,
  disabled = false,
  className,
  children,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const carriesFiles = (event: React.DragEvent): boolean =>
    Array.from(event.dataTransfer.types).includes("Files");

  const reset = () => {
    depth.current = 0;
    setDragging(false);
  };

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(event) => {
        if (disabled || !carriesFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        // Without this the browser refuses the drop and navigates to the file
        // instead — the page is replaced by the image somebody meant to attach.
        if (disabled || !carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        if (disabled) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (disabled || !carriesFiles(event)) return;
        event.preventDefault();
        reset();
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      }}
    >
      {children}

      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-background/85"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <UploadIcon className="size-4" strokeWidth={1.5} />
            Datei hier ablegen zum Anhängen
          </span>
        </div>
      )}
    </div>
  );
}
