import "server-only";

import { db } from "@/lib/db/sqlite";
import { getAnalyticsSettings } from "@/lib/analytics/settings";
import {
  bucketsFor,
  type Granularity,
  type ResolvedRange,
} from "@/lib/analytics/range";
import { getFormSchema } from "@/lib/form-schemas";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TicketPriority,
  TicketStatus,
  type AnalyticsSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The numbers behind the analytics panel.

   Eight aggregations over three tables. Two things are true of all of them and
   worth stating once:

   **Deleted tickets are excluded everywhere.** `deleted_at IS NULL`, the same
   `ALIVE` rule the listings use. A statistic that counts rows nobody can open is
   a statistic nobody can check.

   **No per-user scoping.** This is agent territory — the route is behind
   `requireRole("agent")` — and a queue-wide statistic is the whole point. That is
   also exactly why the route matters: these figures name who filed how many
   tickets, which is not something a reporter gets to see about their colleagues.

   Resolution and response times come out of `mits_audit_log` and
   `mits_ticket_comment` rather than from a column on the ticket, because neither
   exists as a column and adding one would be a second truth. The consequence is
   stated in the panel: a ticket closed before the audit log existed contributes
   nothing, so the sample is smaller than the ticket count.
   ────────────────────────────────────────────────────────────────────────── */

const ALIVE = "t.deleted_at IS NULL";

/** How many rows a ranking shows. Beyond this it stops being a ranking. */
const TOP_N = 8;

/** Topics are only interesting for the people who file a lot. */
const TOPIC_CREATORS = 4;

export interface NamedCount {
  key: string;
  label: string;
  value: number;
}

export interface DurationStat {
  /** Minutes. Null when nothing in the range could be measured. */
  median: number | null;
  mean: number | null;
  /** How many tickets the figure is actually based on. */
  sample: number;
}

export interface AnalyticsData {
  range: { from: string; to: string; granularity: Granularity; label: string };
  totals: {
    created: number;
    resolved: number;
    open: number;
    /** Reporters who filed at least one ticket in the range. */
    reporters: number;
  };
  topCreators: NamedCount[];
  creatorTopics: { creator: string; topics: NamedCount[] }[];
  resolvedPerAgent: NamedCount[];
  resolutionTime: DurationStat;
  firstResponse: DurationStat;
  series: { bucket: string; created: number; resolved: number }[];
  /** 7 × 24, Monday first. `heat[day][hour]`. */
  heatmap: number[][];
  distribution: {
    status: NamedCount[];
    priority: NamedCount[];
    schema: NamedCount[];
  };
}

/**
 * The SQLite expression that buckets `created_at` the same way `bucketKey` does.
 *
 * The two have to agree exactly: the chart's x-axis comes from `bucketsFor` and
 * the counts come from a `GROUP BY` on this. A disagreement produces buckets that
 * are all zero — a chart that renders perfectly and is entirely wrong.
 */
function bucketExpression(column: string, granularity: Granularity): string {
  switch (granularity) {
    case "hour":
      return `substr(${column}, 1, 13) || ':00'`;
    case "day":
      return `substr(${column}, 1, 10)`;
    case "month":
      return `substr(${column}, 1, 7)`;
    case "week":
      // Monday-first, matching ISO-8601 and `bucketKey`. `weekday 0` moves
      // forward to Sunday, so stepping back six days lands on that week's Monday.
      return `date(${column}, 'weekday 0', '-6 days')`;
  }
}

/** The oldest ticket, for the `all` range. Null on a fresh instance. */
export function earliestTicketAt(): string | null {
  const row = db
    .prepare("SELECT MIN(created_at) AS first FROM mits_ticket WHERE deleted_at IS NULL")
    .get() as { first: string | null };
  return row.first;
}

/**
 * Everything the panel needs, in one pass.
 *
 * One function rather than eight endpoints: the widgets share a range and are
 * refreshed together, so eight round trips would be eight chances for the charts
 * to disagree about which minute they are showing. Disabled widgets are skipped
 * here, not hidden in the browser — a switched-off widget costs nothing.
 */
export function collectAnalytics(range: ResolvedRange): AnalyticsData {
  const settings = getAnalyticsSettings();
  const { from, to, granularity } = range;

  return {
    range: { from, to, granularity, label: range.label },
    totals: totals(from, to),
    topCreators: settings.topCreators ? topCreators(from, to) : [],
    creatorTopics: settings.creatorTopics ? creatorTopics(from, to) : [],
    resolvedPerAgent: settings.resolvedPerAgent ? resolvedPerAgent(from, to) : [],
    resolutionTime: settings.resolutionTime
      ? resolutionTime(from, to)
      : emptyDuration(),
    firstResponse: settings.firstResponse
      ? firstResponse(from, to)
      : emptyDuration(),
    series: settings.inflowVsResolved ? series(range) : [],
    heatmap: settings.peakHeatmap ? heatmap(from, to) : emptyHeatmap(),
    distribution: settings.distribution
      ? distribution(from, to)
      : { status: [], priority: [], schema: [] },
  };
}

const emptyDuration = (): DurationStat => ({ median: null, mean: null, sample: 0 });

const emptyHeatmap = (): number[][] =>
  Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

/* ── Totals ─────────────────────────────────────────────────────────────── */

function totals(from: string, to: string): AnalyticsData["totals"] {
  const created = db
    .prepare(
      `SELECT COUNT(*) AS n, COUNT(DISTINCT t.created_by) AS reporters
         FROM mits_ticket t
        WHERE ${ALIVE} AND t.created_at >= ? AND t.created_at <= ?`,
    )
    .get(from, to) as { n: number; reporters: number };

  /*
   * "Resolved in this range" means the *closing* happened in it, not the filing.
   * A ticket opened in March and closed in August belongs to August's throughput —
   * counting it in March would make a month look productive because of work done
   * five months later.
   */
  const resolved = db
    .prepare(
      `SELECT COUNT(DISTINCT a.ticket_id) AS n
         FROM mits_audit_log a
         JOIN mits_ticket t ON t.id = a.ticket_id
        WHERE ${ALIVE}
          AND a.action = 'status_changed'
          AND a.new_value IN ('closed', 'resolved')
          AND a.created_at >= ? AND a.created_at <= ?`,
    )
    .get(from, to) as { n: number };

  const open = db
    .prepare(
      `SELECT COUNT(*) AS n FROM mits_ticket t
        WHERE ${ALIVE} AND t.status NOT IN ('closed', 'resolved')`,
    )
    .get() as { n: number };

  return {
    created: created.n,
    resolved: resolved.n,
    // Deliberately *not* range-scoped: the backlog is a state right now, and
    // "open tickets in August" is not a thing anybody can act on.
    open: open.n,
    reporters: created.reporters,
  };
}

/* ── People ─────────────────────────────────────────────────────────────── */

function topCreators(from: string, to: string): NamedCount[] {
  const rows = db
    .prepare(
      `SELECT t.created_by AS key,
              COALESCE(NULLIF(u.name, ''), t.created_by_email) AS label,
              COUNT(*) AS value
         FROM mits_ticket t
         LEFT JOIN user u ON u.id = t.created_by
        WHERE ${ALIVE} AND t.created_at >= ? AND t.created_at <= ?
        GROUP BY t.created_by
        ORDER BY value DESC, label ASC
        LIMIT ?`,
    )
    .all(from, to, TOP_N) as NamedCount[];
  return rows;
}

/**
 * Which categories the heaviest reporters file.
 *
 * Only the top few people, because the question this answers is "is one desk
 * generating the same problem over and over" — and the same table for two hundred
 * accounts is a spreadsheet, not a chart.
 */
function creatorTopics(from: string, to: string): AnalyticsData["creatorTopics"] {
  const creators = topCreators(from, to).slice(0, TOPIC_CREATORS);
  if (creators.length === 0) return [];

  const perCreator = db.prepare(
    `SELECT COALESCE(NULLIF(t.form_schema_id, ''), 'unbekannt') AS key,
            COUNT(*) AS value
       FROM mits_ticket t
      WHERE ${ALIVE} AND t.created_at >= ? AND t.created_at <= ?
        AND t.created_by = ?
      GROUP BY key
      ORDER BY value DESC
      LIMIT 5`,
  );

  return creators.map((creator) => ({
    creator: creator.label,
    topics: (perCreator.all(from, to, creator.key) as NamedCount[]).map((row) => ({
      ...row,
      label: schemaLabel(row.key),
    })),
  }));
}

/** A form id turned into its title, or the id when the schema is gone. */
function schemaLabel(id: string): string {
  if (id === "unbekannt") return "Ohne Formular";
  return getFormSchema(id)?.title ?? id;
}

/* ── Agents ─────────────────────────────────────────────────────────────── */

/**
 * Who closed what.
 *
 * Attributed to the *actor* in the audit log, not to `assigned_to`: the person
 * who pressed the button is who did it, and a ticket can change hands twice
 * before it closes. `DISTINCT ticket_id` because a ticket reopened and closed
 * again would otherwise count twice for the same agent.
 */
function resolvedPerAgent(from: string, to: string): NamedCount[] {
  return db
    .prepare(
      `SELECT a.actor_id AS key,
              COALESCE(NULLIF(u.name, ''), a.actor_email) AS label,
              COUNT(DISTINCT a.ticket_id) AS value
         FROM mits_audit_log a
         JOIN mits_ticket t ON t.id = a.ticket_id
         LEFT JOIN user u ON u.id = a.actor_id
        WHERE ${ALIVE}
          AND a.action = 'status_changed'
          AND a.new_value IN ('closed', 'resolved')
          AND a.created_at >= ? AND a.created_at <= ?
        GROUP BY a.actor_id
        ORDER BY value DESC, label ASC
        LIMIT ?`,
    )
    .all(from, to, TOP_N) as NamedCount[];
}

/**
 * Creation to first close, in minutes.
 *
 * `MIN(a.created_at)` per ticket: a ticket closed, reopened and closed again took
 * as long as it took the first time — the reopening is a different problem, and
 * averaging over both would report the sum as one resolution.
 *
 * Median *and* mean, because they disagree in a way that matters here. One ticket
 * that sat open over Christmas moves the mean by days and the median not at all,
 * and an agent reading "durchschnittlich 41 Stunden" deserves to see that half
 * were done in two.
 */
function resolutionTime(from: string, to: string): DurationStat {
  const rows = db
    .prepare(
      `SELECT (julianday(MIN(a.created_at)) - julianday(t.created_at)) * 1440 AS minutes
         FROM mits_audit_log a
         JOIN mits_ticket t ON t.id = a.ticket_id
        WHERE ${ALIVE}
          AND a.action = 'status_changed'
          AND a.new_value IN ('closed', 'resolved')
          AND a.created_at >= ? AND a.created_at <= ?
        GROUP BY a.ticket_id, t.created_at`,
    )
    .all(from, to) as { minutes: number | null }[];

  return summarise(rows.map((row) => row.minutes));
}

/**
 * Creation to the first public agent reply, in minutes.
 *
 * Public only. An internal note is a colleague talking to a colleague, and
 * counting it as a response would report a first-reaction time to a customer who
 * has heard nothing.
 *
 * Scoped by the *ticket's* creation, unlike the resolution figure: this is a
 * property of how a cohort of tickets was received, and a ticket answered three
 * months late belongs to the month it arrived in.
 */
function firstResponse(from: string, to: string): DurationStat {
  const rows = db
    .prepare(
      `SELECT (julianday(MIN(c.created_at)) - julianday(t.created_at)) * 1440 AS minutes
         FROM mits_ticket_comment c
         JOIN mits_ticket t ON t.id = c.ticket_id
        WHERE ${ALIVE}
          AND c.deleted_at IS NULL
          AND c.author_is_agent = 1
          AND c.visibility = 'public'
          AND t.created_at >= ? AND t.created_at <= ?
        GROUP BY c.ticket_id, t.created_at`,
    )
    .all(from, to) as { minutes: number | null }[];

  return summarise(rows.map((row) => row.minutes));
}

/**
 * Median, mean and sample size from a list of durations.
 *
 * Negatives are dropped rather than clamped: a reply timestamped before its own
 * ticket means a clock problem, and folding it in as "zero minutes" would report
 * an instant response that never happened.
 */
function summarise(values: (number | null)[]): DurationStat {
  const clean = values
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  if (clean.length === 0) return emptyDuration();

  const middle = Math.floor(clean.length / 2);
  const median =
    clean.length % 2 === 0
      ? (clean[middle - 1] + clean[middle]) / 2
      : clean[middle];

  return {
    median: Math.round(median),
    mean: Math.round(clean.reduce((sum, value) => sum + value, 0) / clean.length),
    sample: clean.length,
  };
}

/* ── Trends ─────────────────────────────────────────────────────────────── */

/**
 * Inflow against throughput, bucket by bucket.
 *
 * Buckets are generated from the range and then filled, rather than derived from
 * the rows. A chart built only from buckets with data draws a straight line
 * across a quiet weekend, which reads as steady volume instead of as a Sunday.
 */
function series(range: ResolvedRange): AnalyticsData["series"] {
  const { from, to, granularity } = range;
  const buckets = bucketsFor(range);

  const created = new Map(
    (
      db
        .prepare(
          `SELECT ${bucketExpression("t.created_at", granularity)} AS bucket,
                  COUNT(*) AS value
             FROM mits_ticket t
            WHERE ${ALIVE} AND t.created_at >= ? AND t.created_at <= ?
            GROUP BY bucket`,
        )
        .all(from, to) as { bucket: string; value: number }[]
    ).map((row) => [row.bucket, row.value]),
  );

  const resolved = new Map(
    (
      db
        .prepare(
          `SELECT ${bucketExpression("a.created_at", granularity)} AS bucket,
                  COUNT(DISTINCT a.ticket_id) AS value
             FROM mits_audit_log a
             JOIN mits_ticket t ON t.id = a.ticket_id
            WHERE ${ALIVE}
              AND a.action = 'status_changed'
              AND a.new_value IN ('closed', 'resolved')
              AND a.created_at >= ? AND a.created_at <= ?
            GROUP BY bucket`,
        )
        .all(from, to) as { bucket: string; value: number }[]
    ).map((row) => [row.bucket, row.value]),
  );

  return buckets.map((bucket) => ({
    bucket,
    created: created.get(bucket) ?? 0,
    resolved: resolved.get(bucket) ?? 0,
  }));
}

/**
 * Weekday against hour, Monday first.
 *
 * `strftime('%w')` returns 0 for Sunday, so it is shifted: a support week starts
 * on Monday, and a matrix whose first row is Sunday puts the quietest day where
 * the eye lands first.
 */
function heatmap(from: string, to: string): number[][] {
  const grid = emptyHeatmap();

  const rows = db
    .prepare(
      `SELECT CAST(strftime('%w', t.created_at) AS INTEGER) AS weekday,
              CAST(strftime('%H', t.created_at) AS INTEGER) AS hour,
              COUNT(*) AS value
         FROM mits_ticket t
        WHERE ${ALIVE} AND t.created_at >= ? AND t.created_at <= ?
        GROUP BY weekday, hour`,
    )
    .all(from, to) as { weekday: number; hour: number; value: number }[];

  for (const row of rows) {
    const day = (row.weekday + 6) % 7;
    if (day < 0 || day > 6 || row.hour < 0 || row.hour > 23) continue;
    grid[day][row.hour] = row.value;
  }

  return grid;
}

/* ── Distribution ───────────────────────────────────────────────────────── */

function distribution(from: string, to: string): AnalyticsData["distribution"] {
  const byColumn = (column: string) =>
    db
      .prepare(
        `SELECT ${column} AS key, COUNT(*) AS value
           FROM mits_ticket t
          WHERE ${ALIVE} AND t.created_at >= ? AND t.created_at <= ?
          GROUP BY key
          ORDER BY value DESC`,
      )
      .all(from, to) as { key: string; value: number }[];

  return {
    status: byColumn("t.status").map((row) => ({
      ...row,
      // Parsed rather than indexed directly: a row carrying a status this build
      // does not know renders as its raw value instead of as `undefined`.
      label:
        TICKET_STATUS_LABELS[TicketStatus.safeParse(row.key).data ?? "open"] ??
        row.key,
    })),
    priority: byColumn("t.priority").map((row) => ({
      ...row,
      label:
        TICKET_PRIORITY_LABELS[
          TicketPriority.safeParse(row.key).data ?? "medium"
        ] ?? row.key,
    })),
    schema: byColumn("COALESCE(NULLIF(t.form_schema_id, ''), 'unbekannt')")
      .map((row) => ({ ...row, label: schemaLabel(row.key) }))
      .slice(0, TOP_N),
  };
}

/** Re-exported so the settings page and the panel agree on what exists. */
export type { AnalyticsSettings };
