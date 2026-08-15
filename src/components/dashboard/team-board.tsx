import Link from "next/link";
import {
  ClockIcon,
  InboxIcon,
  ReplyIcon,
  TriangleAlertIcon,
} from "lucide-react";

import {
  TeamWorkload,
  type WorkloadMember,
  type WorkloadTicket,
} from "@/components/dashboard/team-workload";
import { formatRelativeTime } from "@/lib/format";
import type { TeamOverview, TeamTicket } from "@/lib/team";
import { cn } from "@/lib/utils";
import { formatTicketNumber, type TeamSettings } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Rückstand, Auslastung und Präsenz auf einer Fläche.

   Der Rückstandsblock bleibt serverseitig — vier Zahlen und zwei Links, nichts
   davon reagiert auf etwas. Die Auslastungsliste geht als fertige Daten an
   `TeamWorkload`, weil dort gezogen wird und der optimistische Zustand einen
   Client braucht.

   **Die Zeitrechnung läuft hier, nicht dort.** Alle Alter werden mit *einer*
   Serveruhr formatiert und als Strings übergeben — dieselbe Regel wie bei
   `PresenceList`. Ein `Date.now()` im Browser gäbe nach der Hydration eine
   andere Antwort als beim Rendern, und der Mismatch säße auf genau dem Feld,
   das sagen soll, wie lange etwas schon liegt.

   **Präsenz ist keine eigene Liste mehr, sondern der Punkt an der Zeile.** Eine
   zweite Namensliste neben der ersten wäre dieselbe Information zweimal.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Die Queue dieser Person, gefiltert.
 *
 * `scope=pool` und nicht `mine`: „mein Bereich" heißt der eingeloggte Agent, und
 * gemeint ist der aus der Zeile. Der Deep-Filter `assignedTo` legt sich über das
 * Preset und verengt es — die Richtung, die `parseTicketQuery` erlaubt.
 */
const queueHrefFor = (agentId: string) =>
  `/mits?scope=pool&view=open&assignedTo=${encodeURIComponent(agentId)}`;

const toWorkloadTicket = (ticket: TeamTicket, now: number): WorkloadTicket => ({
  id: ticket.id,
  label: formatTicketNumber(ticket.ticketNumber ?? 0),
  title: ticket.title,
  priority: ticket.priority,
  createdAt: ticket.createdAt,
  ageLabel: formatRelativeTime(new Date(ticket.createdAt), now),
});

interface Tile {
  key: string;
  label: string;
  value: number;
  hint: string | null;
  icon: typeof InboxIcon;
  /**
   * `null`, wo es keinen Filter gibt, der genau diese Menge zeigt.
   *
   * Absichtlich kein Link auf etwas Ähnliches: eine Kachel, die „7" sagt und auf
   * eine Liste mit dreiundzwanzig Zeilen führt, ist schlechter als eine Kachel
   * ohne Link. „Wartet auf uns" und „ohne Bewegung" sind abgeleitete Mengen, für
   * die die Queue keinen Filter hat.
   */
  href: string | null;
  /** Nur die kritischen Tickets färben. Vier auffällige Zahlen sind keine. */
  alarming?: boolean;
}

export function TeamBoard({
  overview,
  settings,
  now,
}: {
  overview: TeamOverview;
  settings: TeamSettings;
  /** Eine Uhr für die ganze Seite, damit zwei Alter nicht Sekunden auseinanderliegen. */
  now: number;
}) {
  const { backlog, members, pool } = overview;

  const workloadMembers: WorkloadMember[] = members.map((member) => ({
    id: member.id,
    name: member.name,
    state: member.state,
    open: member.load.open,
    high: member.load.high,
    critical: member.load.critical,
    capacity: member.capacity,
    oldestLabel: member.load.oldest
      ? formatRelativeTime(new Date(member.load.oldest), now)
      : null,
    resolvedToday: member.resolvedToday,
    current: member.current
      ? {
          id: member.current.ticketId,
          label: formatTicketNumber(member.current.ticketNumber ?? 0),
          title: member.current.title,
        }
      : null,
    tickets: member.tickets.map((ticket) => toWorkloadTicket(ticket, now)),
    queueHref: queueHrefFor(member.id),
  }));

  return (
    <div className="grid gap-8">
      {backlog && <BacklogBlock backlog={backlog} settings={settings} now={now} />}

      {settings.show_workload && (
        <TeamWorkload
          members={workloadMembers}
          pool={
            pool
              ? {
                  tickets: pool.tickets.map((ticket) =>
                    toWorkloadTicket(ticket, now),
                  ),
                  total: pool.total,
                }
              : null
          }
          settings={settings}
        />
      )}
    </div>
  );
}

function BacklogBlock({
  backlog,
  settings,
  now,
}: {
  backlog: NonNullable<TeamOverview["backlog"]>;
  settings: TeamSettings;
  now: number;
}) {
  const tiles: Tile[] = [
    {
      key: "pool",
      label: "Unzugewiesen",
      value: backlog.pool,
      hint: backlog.poolOldest
        ? `ältestes ${formatRelativeTime(new Date(backlog.poolOldest), now)}`
        : null,
      icon: InboxIcon,
      href: "/mits?scope=pool&view=inbox",
    },
    {
      key: "awaiting",
      label: "Wartet auf uns",
      value: backlog.awaitingReply,
      hint: null,
      icon: ReplyIcon,
      href: null,
    },
    // Bei `stale_days = 0` ist die Zahl abgeschaltet, nicht null — eine Kachel
    // mit einer konstanten Null ist eine Kennzahl, die niemand mehr liest.
    ...(settings.stale_days > 0
      ? [
          {
            key: "stale",
            label: `Ohne Bewegung (${settings.stale_days} Tage)`,
            value: backlog.stale,
            hint: null,
            icon: ClockIcon,
            href: null,
          } satisfies Tile,
        ]
      : []),
    {
      key: "critical",
      label: "Kritisch offen",
      value: backlog.critical,
      hint: null,
      icon: TriangleAlertIcon,
      href: "/mits?scope=pool&view=open&priority=critical",
      alarming: backlog.critical > 0,
    },
  ];

  return (
    <section aria-label="Rückstand" className="grid gap-3">
      <h2 className="label-industrial">Rückstand</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <TileCard key={tile.key} tile={tile} />
        ))}
      </div>
    </section>
  );
}

function TileCard({ tile }: { tile: Tile }) {
  const Icon = tile.icon;

  const body = (
    <>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" strokeWidth={1.5} aria-hidden />
        <span className="text-xs">{tile.label}</span>
      </div>
      <p
        className={cn(
          "mt-2 text-3xl font-normal tabular-nums",
          tile.alarming && "text-destructive",
        )}
      >
        {tile.value}
      </p>
      {tile.hint && (
        <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
      )}
    </>
  );

  const shell = "rounded-2xl border border-border px-4 py-3";

  return tile.href ? (
    <Link
      href={tile.href}
      className={cn(
        shell,
        "block transition-colors hover:border-foreground/20 hover:bg-accent",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
