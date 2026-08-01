"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   How the ticket page's keystrokes reach its reply box.

   A context and not props, for one reason: the ticket page is a Server
   Component. It cannot create a ref, so it cannot hand the same one to the
   composer and to the shortcut handler — and those two are the only components
   that need to meet.

   **Two callbacks, not a DOM node.** Focusing differs by variant — the textarea
   takes `.focus()`, the rich editor needs a tiptap command chain because a
   contenteditable is not focusable through an element ref — and the internal
   switch is React state with no element to click. Handing out a node would make
   the caller know both of those; handing out a function means only the composer
   does.

   Scoped to the ticket page rather than global. There is one composer per page,
   and a context mounted at the root would let any component anywhere claim `r`
   for a field that is not the one on screen.
   ────────────────────────────────────────────────────────────────────────── */

export interface ComposerHandle {
  /** Put the caret in the reply field. */
  focus: React.RefObject<(() => void) | null>;
  /** Flip the internal-note switch. Null for a reporter, who has none. */
  toggleInternal: React.RefObject<(() => void) | null>;
}

const ComposerHandleContext = createContext<ComposerHandle | null>(null);

/**
 * Returns `null` outside a provider rather than throwing.
 *
 * The composer also renders on pages that have no shortcut handler, and a
 * component that would like to be reachable by keyboard must not be the reason a
 * page fails to render.
 */
export function useComposerHandle(): ComposerHandle | null {
  return useContext(ComposerHandleContext);
}

export function ComposerHandleProvider({ children }: { children: ReactNode }) {
  const focus = useRef<(() => void) | null>(null);
  const toggleInternal = useRef<(() => void) | null>(null);

  // Stable identity: the refs never change, so neither should the object, or
  // every consumer re-renders whenever the page does.
  const value = useMemo<ComposerHandle>(
    () => ({ focus, toggleInternal }),
    [],
  );

  return (
    <ComposerHandleContext.Provider value={value}>
      {children}
    </ComposerHandleContext.Provider>
  );
}
