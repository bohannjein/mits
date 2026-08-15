import Link from "next/link";
import {
  ClockIcon,
  InboxIcon,
  ReplyIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/format";
import type { TeamMember, TeamOverview } from "@/lib/team";
import { cn } from "@/lib/utils";
import {
  PRESENCE_LABELS,
  formatTicketNumber,
  isOverloaded,
  loadRatio,
  type PresenceState,
  type TeamSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Rückstand, Auslastung und Präsenz auf einer Fläche.

   **Eine Server-Komponente**, wie jede andere Liste in MITS. Die Ausnahme ist
   das Statistik-Panel, und der Grund dafür — Charts, die bei jedem Tick neu
   mounten würden — gilt hier nicht: was diese Seite zeigt, sind Zahlen und
   Zeilen, und `QueueLive` daneben stößt bei einem `queue`-Signal ein
   `router.refresh()` an. Damit läuft die Zeitrechnung serverseitig, und es gibt
   kein `Date.now()` im Browser, das nach der Hydration eine andere Antwort gibt
   als beim Rendern.

   **Präsenz ist keine eigene Liste mehr, sondern der Punkt an der Zeile.** Eine
   zweite Namensliste neben der ersten wäre dieselbe Information zweimal, und die
   Frage „ist der da, dem das gehört" hängt an genau der Zeile, in der die Last
   steht.
   ────────────────────────────────────────────────────────────────────────── */

/** Grün / gelb / grau. Dieselbe Zuordnung wie in `presence-tabs.tsx`. */
const DOT: Record<PresenceState, string> = {
  active: "bg-success",
  idle: "bg-warning",
  offline: "bg-muted-foreground/50",
};

/**
 * Die Queue dieser Person, gefiltert.
 *
 * `scope=pool` und nicht `mine`: „mein Bereich" heißt der eingeloggte Agent, und
 * gemeint ist der aus der Zeile. Der Deep-Filter `assignedTo` legt sich über das
 * Preset und verengt es — die Richtung, die `parseTicketQuery` erlaubt.
 */
const queueHrefFor = (agentId: string) =>
  `/mits?scope=pool&view=open&assignedTo=${encodeURIComponent(agentId)}`;

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
  const { backlog, members } = overview;

  return (
    <div className="grid gap-8">
      {backlog && <BacklogBlock backlog={backlog} settings={settings} now={now} />}

      {settings.show_workload && (
        <section aria-label="Auslastung" className="grid gap-3">
          <h2 className="label-industrial">Auslastung</h2>
          {members.length === 0 ? (
            <p className="rounded-2xl border border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Kein Konto mit Agenten-Rolle.
            </p>
          ) : (
            <ul className="grid gap-2">
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  settings={settings}
                  now={now}
                />
              ))}
            </ul>
          )}
        </section>
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

function MemberRow({
  member,
  settings,
  now,
}: {
  member: TeamMember;
  settings: TeamSettings;
  now: number;
}) {
  const over = isOverloaded(member.load.open, member.capacity);
  const ratio = loadRatio(member.load.open, member.capacity);

  /*
   * Die Detailzeile ist eine Reihe kurzer Angaben, keine Tabelle. Was
   * abgeschaltet ist, fehlt hier — und weil jede für sich weggenommen werden
   * kann, wird die Zeile gar nicht erst gerendert, wenn nichts übrig bleibt.
   */
  const details: string[] = [];
  if (settings.show_priority_split) {
    if (member.load.critical > 0) details.push(`${member.load.critical} kritisch`);
    if (member.load.high > 0) details.push(`${member.load.high} hoch`);
  }
  if (settings.show_oldest_age && member.load.oldest) {
    details.push(
      `ältestes ${formatRelativeTime(new Date(member.load.oldest), now)}`,
    );
  }
  if (settings.show_resolved_today) {
    details.push(`heute ${member.resolvedToday} abgeschlossen`);
  }

  return (
    <li className="rounded-2xl border border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {settings.show_presence && (
          <span className="flex items-center gap-2">
            <span
              className={cn("size-2 shrink-0 rounded-full", DOT[member.state])}
              aria-hidden
            />
            {/* Farbe allein ist das eine Signal, das ein rot-grün-blinder Leser
                verliert — dieselbe Regel wie an den Queue-Markern. */}
            <span className="sr-only">{PRESENCE_LABELS[member.state]}</span>
          </span>
        )}

        <Link
          href={queueHrefFor(member.id)}
          className="font-medium hover:underline"
        >
          {member.name}
        </Link>

        {over && (
          <Badge
            variant="outline"
            className="rounded-full border-destructive/40 text-destructive"
          >
            <TriangleAlertIcon className="size-3" strokeWidth={2} aria-hidden />
            Über Kapazität
          </Badge>
        )}

        <span className="ml-auto shrink-0 text-sm tabular-nums text-muted-foreground">
          {settings.show_capacity_bar && member.capacity > 0
            ? `${member.load.open} / ${member.capacity}`
            : `${member.load.open} offen`}
        </span>
      </div>

      {settings.show_capacity_bar && (
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-elevated"
          role="img"
          aria-label={`${member.load.open} von ${member.capacity} offenen Tickets`}
        >
          <div
            className={cn(
              "h-full rounded-full",
              over ? "bg-destructive" : "bg-primary",
            )}
            /*
             * Breite als Inline-Style, weil sie aus Daten kommt — eine
             * Tailwind-Klasse je Prozentwert gibt es nicht, und `loadRatio`
             * fängt die Division durch null ab, damit hier nie `NaN%` steht.
             */
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      )}

      {(details.length > 0 || member.current) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {member.current && (
            <Link
              href={`/mits/tickets/${member.current.ticketId}`}
              className="inline-flex max-w-full items-center gap-1.5 hover:text-foreground hover:underline"
            >
              <UsersIcon className="size-3 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="truncate">
                {formatTicketNumber(member.current.ticketNumber ?? 0)} ·{" "}
                {member.current.title}
              </span>
            </Link>
          )}
          {details.map((detail) => (
            <span key={detail}>{detail}</span>
          ))}
        </div>
      )}
    </li>
  );
}
