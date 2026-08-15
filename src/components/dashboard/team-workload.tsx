"use client";

import {
  ArrowRightLeftIcon,
  InboxIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  TicketIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";

import { assignTicketAction } from "@/app/actions/tickets";
import { useToast } from "@/components/feedback/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  PRESENCE_LABELS,
  PRIORITY_RANK,
  TICKET_PRIORITY_LABELS,
  isElevatedPriority,
  isOverloaded,
  loadRatio,
  type PresenceState,
  type TeamSettings,
  type TicketPriority,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Die Auslastungsliste, und darin das Umverteilen.

   **Ziehen mit der nativen HTML5-Schnittstelle**, keine neue Abhängigkeit.
   `Reorder` aus framer-motion — das Werkzeug, das dieses Projekt für den
   Formular-Canvas benutzt — ordnet innerhalb *einer* Liste um und kann nicht
   zwischen zwei Containern ziehen; für „von Meier zu Schulz" ist es das falsche
   Werkzeug.

   **Das Menü an jeder Zeile ist kein Nachgedanke.** Ziehen ist für eine Maus
   schneller und auf einem Touchgerät und mit der Tastatur gar nicht bedienbar.
   Beide Wege laufen in dieselbe Funktion.

   **Es gibt keinen neuen Schreibpfad.** Der Drop ruft `assignTicketAction` —
   dieselbe Tür, die die Ticketseite benutzt, mit Rollenprüfung, Audit-Zeile,
   Benachrichtigung und Revalidierung. Ein zweiter Eingang wäre ein zweiter Ort,
   das falsch zu machen; aus demselben Grund hat `AgentInbox` seinerzeit keine
   eigene Claim-Action bekommen.

   **Optimistisch, mit Rücknahme im Fehlerfall.** Der Chip wandert sofort; ein
   abgelehnter Aufruf schiebt ihn zurück und meldet sich als Toast. Erfolg meldet
   sich nicht — der gewanderte Chip *ist* die Rückmeldung, dieselbe Regel wie
   beim Anheften.
   ────────────────────────────────────────────────────────────────────────── */

/** Der Ablageort „niemand". Ein String, weil `dataTransfer` nur Strings kennt. */
const POOL = "__pool";

const DOT: Record<PresenceState, string> = {
  active: "bg-success",
  idle: "bg-warning",
  offline: "bg-muted-foreground/50",
};

export interface WorkloadTicket {
  id: string;
  /** `TCK-1000000000000421`, serverseitig formatiert. */
  label: string;
  title: string;
  priority: TicketPriority;
  createdAt: string;
  ageLabel: string;
}

export interface WorkloadMember {
  id: string;
  name: string;
  state: PresenceState;
  /** Alle offenen, auch die nicht gezeigten. */
  open: number;
  high: number;
  critical: number;
  capacity: number;
  oldestLabel: string | null;
  resolvedToday: number;
  current: { id: string; label: string; title: string } | null;
  tickets: WorkloadTicket[];
  queueHref: string;
}

export interface WorkloadPool {
  tickets: WorkloadTicket[];
  total: number;
}

export function TeamWorkload({
  members,
  pool,
  settings,
}: {
  members: WorkloadMember[];
  /** `null`, solange `allow_reassign` aus ist — dann gibt es nichts zu ziehen. */
  pool: WorkloadPool | null;
  settings: TeamSettings;
}) {
  const { toast } = useToast();
  const [, startTransition] = useTransition();

  /**
   * Wohin ein Ticket verschoben wurde, solange der Server antwortet.
   *
   * Die Karte hält nur die *Abweichungen* vom Serverstand. Bei Erfolg wird der
   * Eintrag nicht zurückgenommen: er entspricht dann dem, was geschrieben wurde,
   * und die Revalidierung zieht die Props nach. Ihn sofort zu räumen wäre ein
   * sichtbares Zurückspringen für die Dauer der Revalidierung.
   */
  const [moved, setMoved] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<Record<string, true>>({});
  const [over, setOver] = useState<string | null>(null);

  /*
   * `dragleave` feuert auch beim Wechsel auf ein Kindelement — derselbe Zähler
   * wie in der Dropzone des Erstellungs-Chats, sonst flackert die Markierung,
   * sobald der Cursor über einen Chip innerhalb des Ziels fährt.
   */
  const depth = useRef<Map<string, number>>(new Map());

  const reassign = pool !== null;

  /** Jedes Ticket auf dem Schirm, plus sein Platz laut Server. */
  const { all, home } = useMemo(() => {
    const all = new Map<string, WorkloadTicket>();
    const home = new Map<string, string | null>();

    for (const ticket of pool?.tickets ?? []) {
      all.set(ticket.id, ticket);
      home.set(ticket.id, null);
    }
    for (const member of members) {
      for (const ticket of member.tickets) {
        all.set(ticket.id, ticket);
        home.set(ticket.id, member.id);
      }
    }
    return { all, home };
  }, [members, pool]);

  const ownerOf = (ticketId: string): string | null =>
    ticketId in moved ? moved[ticketId] : (home.get(ticketId) ?? null);

  /** Was gerade bei diesem Ziel liegt, dringendstes zuerst. */
  const ticketsFor = (target: string | null): WorkloadTicket[] =>
    [...all.values()]
      .filter((ticket) => ownerOf(ticket.id) === target)
      .sort(
        (a, b) =>
          PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
          a.createdAt.localeCompare(b.createdAt),
      );

  const move = (ticketId: string, target: string | null) => {
    if (ownerOf(ticketId) === target) return;

    const previous = ownerOf(ticketId);
    setMoved((current) => ({ ...current, [ticketId]: target }));
    setBusy((current) => ({ ...current, [ticketId]: true }));

    const formData = new FormData();
    formData.set("ticketId", ticketId);
    // Der leere Wert ist die dokumentierte Form für „Zuweisung aufheben"; die
    // Action übersetzt ihn und `__none` gleich.
    formData.set("assigneeId", target ?? "");

    startTransition(async () => {
      const result = await assignTicketAction(null, formData);

      setBusy((current) => {
        const next = { ...current };
        delete next[ticketId];
        return next;
      });

      if (result.ok) return;

      // Zurück auf den Stand, der vor dem Ziehen galt — nicht auf den
      // Serverstand: dazwischen kann eine andere Verschiebung liegen, die
      // durchgegangen ist.
      setMoved((current) => ({ ...current, [ticketId]: previous }));
      toast({ kind: "system", tone: "warning", title: result.error });
    });
  };

  const dropHandlers = (target: string | null) => {
    if (!reassign) return {};
    const key = target ?? POOL;

    return {
      onDragOver: (event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      },
      onDragEnter: () => {
        const next = (depth.current.get(key) ?? 0) + 1;
        depth.current.set(key, next);
        setOver(key);
      },
      onDragLeave: () => {
        const next = (depth.current.get(key) ?? 1) - 1;
        depth.current.set(key, next);
        if (next <= 0) {
          depth.current.delete(key);
          setOver((current) => (current === key ? null : current));
        }
      },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault();
        depth.current.delete(key);
        setOver(null);
        const ticketId = event.dataTransfer.getData("text/plain");
        if (ticketId) move(ticketId, target);
      },
    };
  };

  /** Die Ziele des Menüs — Reihenfolge wie die Liste, plus der Pool. */
  const targets = members.map((member) => ({ id: member.id, name: member.name }));

  return (
    <section aria-label="Auslastung" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="label-industrial">Auslastung</h2>
        {reassign && (
          <p className="text-xs text-muted-foreground">
            Zeilen lassen sich auf einen Namen ziehen. Ohne Maus geht es über das
            Menü an der Zeile.
          </p>
        )}
      </div>

      {pool && (
        <PoolBlock
          tickets={ticketsFor(null)}
          total={pool.total}
          shown={pool.tickets.length}
          busy={busy}
          targets={targets}
          highlighted={over === POOL}
          onMove={move}
          handlers={dropHandlers(null)}
        />
      )}

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
              visible={reassign ? ticketsFor(member.id) : null}
              busy={busy}
              targets={targets}
              highlighted={over === member.id}
              onMove={move}
              handlers={dropHandlers(member.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PoolBlock({
  tickets,
  total,
  shown,
  busy,
  targets,
  highlighted,
  onMove,
  handlers,
}: {
  tickets: WorkloadTicket[];
  total: number;
  shown: number;
  busy: Record<string, true>;
  targets: { id: string; name: string }[];
  highlighted: boolean;
  onMove: (ticketId: string, target: string | null) => void;
  handlers: Record<string, unknown>;
}) {
  const hidden = Math.max(0, total - shown);

  return (
    <div
      {...handlers}
      className={cn(
        "rounded-2xl border border-dashed border-border px-4 py-3 transition-colors",
        highlighted && "border-primary bg-accent",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <InboxIcon
          className="size-4 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden
        />
        <span className="text-sm font-medium">Pool</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {total} unzugewiesen
        </span>
      </div>

      <TicketStrip
        tickets={tickets}
        busy={busy}
        targets={targets}
        currentTarget={null}
        onMove={onMove}
        emptyText="Nichts unzugewiesen."
      />

      {/*
        Was der Deckel wegnimmt, steht als Zahl da. Eine gekürzte Liste, die sich
        für vollständig ausgibt, ist das eine Ergebnis, das man ablehnen muss.
      */}
      {hidden > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          <Link
            href="/mits?scope=pool&view=inbox"
            className="hover:text-foreground hover:underline"
          >
            … und {hidden} weitere im Eingang
          </Link>
        </p>
      )}
    </div>
  );
}

function MemberRow({
  member,
  settings,
  visible,
  busy,
  targets,
  highlighted,
  onMove,
  handlers,
}: {
  member: WorkloadMember;
  settings: TeamSettings;
  /** `null`, solange nicht umverteilt werden darf — dann gibt es keine Chips. */
  visible: WorkloadTicket[] | null;
  busy: Record<string, true>;
  targets: { id: string; name: string }[];
  highlighted: boolean;
  onMove: (ticketId: string, target: string | null) => void;
  handlers: Record<string, unknown>;
}) {
  /*
   * Die Zahlen folgen dem, was gerade zu sehen ist.
   *
   * Gerechnet wird als Differenz gegen den Serverstand, nicht aus der sichtbaren
   * Liste allein: über dem Deckel gibt es Tickets, deren Priorität diese Seite
   * nicht kennt. `open - tickets.length` ist genau ihr Beitrag, und der bleibt
   * beim Verschieben unberührt.
   */
  const open = visible
    ? member.open - member.tickets.length + visible.length
    : member.open;
  const countBy = (list: WorkloadTicket[], priority: TicketPriority) =>
    list.filter((ticket) => ticket.priority === priority).length;
  const high = visible
    ? member.high - countBy(member.tickets, "high") + countBy(visible, "high")
    : member.high;
  const critical = visible
    ? member.critical -
      countBy(member.tickets, "critical") +
      countBy(visible, "critical")
    : member.critical;

  const over = isOverloaded(open, member.capacity);
  const ratio = loadRatio(open, member.capacity);
  const hidden = visible ? Math.max(0, open - visible.length) : 0;

  const details: string[] = [];
  if (settings.show_priority_split) {
    if (critical > 0) details.push(`${critical} kritisch`);
    if (high > 0) details.push(`${high} hoch`);
  }
  if (settings.show_oldest_age && member.oldestLabel) {
    details.push(`ältestes ${member.oldestLabel}`);
  }
  if (settings.show_resolved_today) {
    details.push(`heute ${member.resolvedToday} abgeschlossen`);
  }

  return (
    <li
      {...handlers}
      className={cn(
        "rounded-2xl border border-border px-4 py-3 transition-colors",
        highlighted && "border-primary bg-accent",
      )}
    >
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

        <Link href={member.queueHref} className="font-medium hover:underline">
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
            ? `${open} / ${member.capacity}`
            : `${open} offen`}
        </span>
      </div>

      {settings.show_capacity_bar && (
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-elevated"
          role="img"
          aria-label={`${open} von ${member.capacity} offenen Tickets`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width]",
              over ? "bg-destructive" : "bg-primary",
            )}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      )}

      {(details.length > 0 || member.current) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {member.current && settings.show_current_ticket && (
            <Link
              href={`/mits/tickets/${member.current.id}`}
              className="inline-flex max-w-full items-center gap-1.5 hover:text-foreground hover:underline"
            >
              <TicketIcon className="size-3 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="truncate">
                {member.current.label} · {member.current.title}
              </span>
            </Link>
          )}
          {details.map((detail) => (
            <span key={detail}>{detail}</span>
          ))}
        </div>
      )}

      {visible && (
        <>
          <TicketStrip
            tickets={visible}
            busy={busy}
            targets={targets}
            currentTarget={member.id}
            onMove={onMove}
            emptyText="Nichts offen."
          />
          {hidden > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              <Link
                href={member.queueHref}
                className="hover:text-foreground hover:underline"
              >
                … und {hidden} weitere
              </Link>
            </p>
          )}
        </>
      )}
    </li>
  );
}

function TicketStrip({
  tickets,
  busy,
  targets,
  currentTarget,
  onMove,
  emptyText,
}: {
  tickets: WorkloadTicket[];
  busy: Record<string, true>;
  targets: { id: string; name: string }[];
  currentTarget: string | null;
  onMove: (ticketId: string, target: string | null) => void;
  emptyText: string;
}) {
  if (tickets.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {tickets.map((ticket) => (
        <TicketChip
          key={ticket.id}
          ticket={ticket}
          busy={busy[ticket.id] === true}
          targets={targets}
          currentTarget={currentTarget}
          onMove={onMove}
        />
      ))}
    </ul>
  );
}

function TicketChip({
  ticket,
  busy,
  targets,
  currentTarget,
  onMove,
}: {
  ticket: WorkloadTicket;
  busy: boolean;
  targets: { id: string; name: string }[];
  currentTarget: string | null;
  onMove: (ticketId: string, target: string | null) => void;
}) {
  return (
    <li
      draggable={!busy}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", ticket.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      title={`${ticket.label} · ${ticket.title} · ${ticket.ageLabel}`}
      className={cn(
        "flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-2.5 pr-1 text-xs",
        busy ? "opacity-60" : "cursor-grab active:cursor-grabbing",
      )}
    >
      {busy ? (
        <Loader2Icon className="size-3 shrink-0 animate-spin" aria-hidden />
      ) : (
        <ArrowRightLeftIcon
          className="size-3 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden
        />
      )}

      <Link
        href={`/mits/tickets/${ticket.id}`}
        className="max-w-56 truncate hover:underline"
        // Ein Klick auf den Titel öffnet das Ticket; das Ziehen beginnt am
        // Chip, und ein Link ist von sich aus ziehbar — ohne das schickt der
        // Browser seine eigene URL statt der Ticket-Id.
        draggable={false}
      >
        <span className="text-muted-foreground">{ticket.label.slice(-6)}</span>{" "}
        {ticket.title}
      </Link>

      {isElevatedPriority(ticket.priority) && (
        <Badge variant="default" className="h-auto rounded-full px-1.5 py-0 text-[10px]">
          {TICKET_PRIORITY_LABELS[ticket.priority]}
        </Badge>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={busy}
            aria-label={`${ticket.label} zuweisen`}
            className="size-6 shrink-0 rounded-full hover:bg-accent hover:text-accent-foreground"
          >
            <MoreHorizontalIcon className="size-3.5" strokeWidth={1.5} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 rounded-2xl border border-border shadow-elev-2"
        >
          <DropdownMenuLabel>Zuweisen an</DropdownMenuLabel>
          {targets.map((target) => (
            <DropdownMenuItem
              key={target.id}
              disabled={target.id === currentTarget}
              onSelect={() => onMove(ticket.id, target.id)}
            >
              {target.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={currentTarget === null}
            onSelect={() => onMove(ticket.id, null)}
          >
            <InboxIcon />
            In den Pool
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
