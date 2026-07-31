import {
  PresenceTabs,
  type PresenceRow,
} from "@/components/dashboard/presence-tabs";
import { canViewBoard } from "@/lib/auth/roles";
import type { AgentPresence } from "@/lib/presence";

/* ──────────────────────────────────────────────────────────────────────────
   Who is around.

   A server component, and it stays one: it splits the list by role and turns the
   last-seen timestamp into text here, so `PresenceTabs` receives finished values and
   never has to call `Date.now()` while rendering. That call would differ between the
   server pass and hydration and produce a mismatch on exactly the field that is
   supposed to say how long ago somebody was seen.

   Rendered only from `/mits`, which is behind the technician gate. That is what keeps
   reporter presence out of a reporter's own view now that everyone is recorded.
   ────────────────────────────────────────────────────────────────────────── */

/** Coarse on purpose — "vor 3 Min." is enough, a clock time invites tracking. */
function ago(seenAt: Date | null): string {
  if (!seenAt) return "noch nie";

  const minutes = Math.floor((Date.now() - seenAt.getTime()) / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return `vor ${Math.floor(hours / 24)} T.`;
}

const toRow = (entry: AgentPresence): PresenceRow => ({
  id: entry.id,
  name: entry.name,
  state: entry.state,
  seenLabel: ago(entry.seenAt),
});

export function PresenceList({
  people,
  title = "Anwesend",
}: {
  people: AgentPresence[];
  title?: string;
}) {
  /*
   * Offline accounts are left out entirely.
   *
   * The list is a dispatch aid — "who can pick this up now" — and on an instance with a
   * few hundred reporters, everyone who has ever signed in would push the useful rows off
   * the screen. An account that has been silent for half an hour answers no question a
   * technician is asking, and the full account list lives in the admin masks.
   *
   * The consequence, stated because it is a real one: somebody absent is
   * indistinguishable here from somebody who has no account. That is the right trade for
   * a sidebar and the wrong one for administration, which is why only this component
   * filters and `listPresence` still returns everybody.
   */
  const present = people.filter((entry) => entry.state !== "offline");

  // Same contract as the other portal widgets: nothing at all means no block.
  if (present.length === 0) return null;

  return (
    <section aria-label={title} className="grid gap-2">
      <h2 className="label-industrial">{title}</h2>
      <PresenceTabs
        staff={present.filter((entry) => canViewBoard(entry.role)).map(toRow)}
        reporters={present.filter((entry) => !canViewBoard(entry.role)).map(toRow)}
      />
    </section>
  );
}
