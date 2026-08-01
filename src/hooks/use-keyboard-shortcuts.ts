"use client";

import { useEffect, useRef } from "react";

import { isPlainKey, isTypingTarget } from "@/lib/shortcuts";

/* ──────────────────────────────────────────────────────────────────────────
   One `keydown` listener, one rule.

   The rule is `isTypingTarget`: a shortcut never fires while the focus is in
   something the user types into. Everything else here is plumbing around it.

   **One listener per hook call, on `window`, in the capture phase off.** Not on a
   container — the whole point is that `j` works while the mouse is anywhere on
   the page, and a container listener needs the container focused, which is
   exactly the state nobody is in.

   **The handler map lives in a ref.** It is read when a key arrives, never
   rendered, and putting it in the dependency array would tear the listener down
   and rebuild it on every render of the page — which on a live-updating queue is
   several times a minute.
   ────────────────────────────────────────────────────────────────────────── */

export type ShortcutMap = Record<string, (event: KeyboardEvent) => void>;

export function useKeyboardShortcuts(
  handlers: ShortcutMap,
  /** Off while a page has nothing to act on — an empty queue, a closed gate. */
  enabled = true,
): void {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      /*
       * Escape is the exception to every rule below.
       *
       * It is the one key whose whole job is to get you *out* of the thing you
       * are typing in, so it must fire precisely when `isTypingTarget` is true.
       * Handled first and returned, before anything else looks at the event.
       */
      if (event.key === "Escape") {
        latest.current["Escape"]?.(event);
        return;
      }

      if (isTypingTarget(event.target)) return;
      if (!isPlainKey(event)) return;

      /*
       * Matched case-insensitively, but only for single characters.
       *
       * `Enter` and `?` arrive as their own names and must not be lowercased into
       * something else; a letter arrives as `j` or `J` depending on the shift key
       * and the caps lock, and somebody with caps lock on still means `j`.
       */
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const handler = latest.current[key];
      if (!handler) return;

      // Only once we know we are handling it. Preventing the default for a key
      // nothing is bound to would break browser type-ahead on every page.
      event.preventDefault();
      handler(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
