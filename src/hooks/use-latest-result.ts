"use client";

import { useEffect, useRef, useState } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   The feedback of the action that ran **last**, not of the first one that ever ran.

   A component with two or more `useActionState` hooks needs one value to render:
   the alert next to the controls, the toast, and in the composer's case whether to
   clear the field. The obvious spelling is `aResult ?? bResult`, and it is wrong
   the moment two of the actions are used in one sitting — `??` picks the first
   **non-null** slot, and a `useActionState` slot never goes back to null. So the
   first action to return anything pins the value forever, and every later action
   is invisible.

   The failure mode is not a wrong label, it is a wrong *state*. Three real ones,
   all of them found in this codebase:

   - The composer: after one successful reply, "Antworten & Schließen" produced no
     toast, did not clear the body and did not move the caret. The agent sees a
     button that went back to normal and their text still sitting there, so they
     send it again — the duplicate customer email.
   - The incident banner: a refused "Hauptstörung anlegen" masked the successful
     dismiss that followed, so the banner stayed above the queue and invited the
     second click that creates a second major incident.
   - Seven editors: a rejected deletion reported the earlier save as green success.

   **Recency is decided by comparing against the previous render, not by position
   in the argument list.** That distinction is the whole hook. Picking "the last
   non-null argument" reads like it works and is the same bug mirrored: with
   `useLatestResult(replyResult, closeResult)`, a second reply after a close would
   be masked by the close result that is still sitting in its slot. Only a slot
   whose identity actually *changed* since the last render represents an action
   that just finished.

   Identity is preserved — each submission produces a fresh result object — so
   effects keyed on the returned value still fire exactly once per submission.
   ────────────────────────────────────────────────────────────────────────── */

export function useLatestResult<T>(...results: (T | null)[]): T | null {
  const [latest, setLatest] = useState<T | null>(null);

  /*
   * Seeded with the first render's values rather than with nulls. A result that is
   * already present on mount is not news — `useActionState` starts at null, so a
   * non-null slot here means the component remounted around a completed action
   * (a `router.refresh()` mid-session does exactly that), and re-announcing it
   * would replay an old toast.
   */
  const previous = useRef<(T | null)[]>(results);

  useEffect(() => {
    let changed: T | null = null;
    for (let i = 0; i < results.length; i += 1) {
      if (results[i] && results[i] !== previous.current[i]) changed = results[i];
    }
    previous.current = results;
    if (changed) setLatest(changed);
    // The argument object is new every render, so the array itself cannot be the
    // dependency. Spreading keeps one entry per slot; the count is fixed per call
    // site, because a component does not grow an action between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...results]);

  return latest;
}
