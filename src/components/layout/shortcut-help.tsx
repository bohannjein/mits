"use client";

import { CommandIcon } from "lucide-react";
import { useState } from "react";

import { Kbd } from "@/components/layout/shortcut-hint";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { SHORTCUT_GROUPS } from "@/lib/shortcuts";

/* ──────────────────────────────────────────────────────────────────────────
   The `?` dialog.

   Mounted once in the header, so every page has it without knowing about it —
   the same arrangement the notification watcher and the presence heartbeat use.

   **It lists every shortcut, including the ones this page does not have.** A
   reference that changed per route would be a reference nobody can learn from;
   the groups are labelled by where they apply, which answers the same question
   without the list moving under the reader.

   The `?` binding lives here rather than in a global map because this is the only
   thing that reacts to it, and a shortcut whose handler is three files away from
   its effect is the kind that survives the deletion of what it opened.
   ────────────────────────────────────────────────────────────────────────── */

export function ShortcutHelp() {
  const [open, setOpen] = useState(false);

  useKeyboardShortcuts({
    // `?` is Shift+/ on most layouts and arrives as its own character, so it
    // needs no modifier handling — `isPlainKey` lets Shift through for exactly
    // this case.
    "?": () => setOpen(true),
    Escape: () => setOpen(false),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl border border-border bg-card shadow-elev-3 sm:max-w-lg">
        <DialogHeader>
          <CommandIcon
            className="size-5 text-primary"
            strokeWidth={1.5}
            aria-hidden
          />
          <DialogTitle className="mt-3 text-lg font-medium">
            Tastaturkürzel
          </DialogTitle>
          <DialogDescription>
            Kürzel greifen nicht, während der Cursor in einem Eingabefeld steht.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="grid gap-2">
              <h3 className="label-industrial">{group.title}</h3>
              <dl className="grid gap-1.5">
                {group.items.map((item) => (
                  <div
                    key={`${group.title}:${item.keys.join("+")}`}
                    className="flex items-center justify-between gap-4"
                  >
                    <dt className="text-sm">{item.description}</dt>
                    <dd className="shrink-0">
                      {/* `always`: here the badges are the content, not a hint
                          beside a label that already says it. */}
                      <Kbd keys={item.keys} always />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
