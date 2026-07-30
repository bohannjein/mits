import { ROLE_LABELS } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import type { AgentPresence } from "@/lib/presence";
import { PRESENCE_LABELS, type PresenceState } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Who is around.

   A server component: the state is derived from a timestamp on read, so there is
   nothing to hydrate. It ages by itself between renders.

   The colours are green / yellow / grey, corrected from the original
   specification which had grey for idle and greyed-out for offline — two shades
   nobody can tell apart at a glance. Do not revert.
   ────────────────────────────────────────────────────────────────────────── */

const DOT: Record<PresenceState, string> = {
  active: "bg-success",
  idle: "bg-warning",
  offline: "bg-muted-foreground/50",
};

const TEXT: Record<PresenceState, string> = {
  active: "text-success",
  idle: "text-warning",
  offline: "text-muted-foreground",
};

/** Coarse on purpose — "vor 3 Min." is enough, a clock time invites tracking. */
function ago(seenAt: Date | null): string {
  if (!seenAt) return "noch nie gesehen";

  const minutes = Math.floor((Date.now() - seenAt.getTime()) / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return `vor ${Math.floor(hours / 24)} Tag(en)`;
}

export function PresenceList({
  agents,
  title = "Technik",
}: {
  agents: AgentPresence[];
  title?: string;
}) {
  if (agents.length === 0) return null;

  const active = agents.filter((agent) => agent.state === "active").length;

  return (
    <section aria-label={title} className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="label-industrial">{title}</h2>
        <span className="text-xs text-muted-foreground">
          {active} von {agents.length} aktiv
        </span>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-elev-1">
        {agents.map((agent) => (
          <li
            key={agent.id}
            className={cn(
              "flex flex-wrap items-center gap-3 px-5 py-3",
              agent.state === "offline" && "opacity-70",
            )}
          >
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", DOT[agent.state])}
            />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {agent.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {ROLE_LABELS[agent.role]} · {ago(agent.seenAt)}
              </span>
            </div>

            {agent.openTickets > 0 && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {agent.openTickets} offen
              </span>
            )}

            <span className={cn("shrink-0 text-xs", TEXT[agent.state])}>
              {PRESENCE_LABELS[agent.state]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
