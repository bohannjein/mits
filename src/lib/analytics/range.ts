/* ──────────────────────────────────────────────────────────────────────────
   Time ranges and buckets for the analytics panel.

   Pure, with `now` as a parameter, so the whole thing is checkable offline. This
   is the layer where a mistake produces a chart that *looks* fine: an off-by-one
   on a bucket boundary silently drops a day, and nobody notices until somebody
   adds up a month by hand.

   **Everything is UTC.** Timestamps are stored as ISO strings in UTC and compared
   as strings — see `searchTickets` — so a bucket boundary has to be UTC midnight
   or the comparison and the label disagree. The display timezone is a *rendering*
   setting and deliberately does not reach in here; the panel says so once rather
   than quietly shifting every boundary by an hour twice a year.
   ────────────────────────────────────────────────────────────────────────── */

export const TIME_RANGES = [
  "today",
  "7d",
  "30d",
  "year",
  "all",
  "custom",
] as const;
export type TimeRange = (typeof TIME_RANGES)[number];

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  today: "Heute",
  "7d": "Letzte 7 Tage",
  "30d": "Letzte 30 Tage",
  year: "Dieses Jahr",
  all: "Gesamter Zeitraum",
  custom: "Eigener Zeitraum",
};

export const GRANULARITIES = ["hour", "day", "week", "month"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  hour: "Stündlich",
  day: "Täglich",
  week: "Wöchentlich",
  month: "Monatlich",
};

export interface ResolvedRange {
  /** Inclusive ISO instant. */
  from: string;
  /** Inclusive ISO instant — the last millisecond of the period. */
  to: string;
  granularity: Granularity;
  label: string;
}

/**
 * How far back `all` reaches when the instance has no tickets yet.
 *
 * A concrete floor rather than the Unix epoch: the empty state would otherwise
 * ask the bucket generator for fifty-five years of months, and an empty chart is
 * not worth six hundred data points.
 */
const EMPTY_ALL_TIME_DAYS = 30;

/** Hard ceiling on how many points a chart may carry. */
export const MAX_BUCKETS = 400;

const DAY_MS = 86_400_000;

const startOfUtcDay = (at: Date): Date =>
  new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));

/**
 * The granularity that keeps a range under `MAX_BUCKETS`.
 *
 * Chosen from the span rather than from the preset, so a custom range of two
 * years and the `all` range of two years get the same treatment. The thresholds
 * are the points where the next unit up starts producing a readable axis: two
 * days of hours is 48 bars, sixty days of hours is 1440.
 */
export function autoGranularity(fromMs: number, toMs: number): Granularity {
  const days = Math.max(1, (toMs - fromMs) / DAY_MS);

  if (days <= 2) return "hour";
  if (days <= 62) return "day";
  if (days <= 400) return "week";
  return "month";
}

/**
 * Turn a preset into concrete bounds.
 *
 * `earliest` is the oldest ticket the instance has, used only by `all`. Passing
 * null means "no tickets yet" and falls back to the recent past.
 *
 * A `custom` range with unusable dates degrades to the last thirty days rather
 * than erroring. Same rule as `parseTicketQuery`: a stale bookmark should show a
 * chart, not a stack trace.
 */
export function resolveRange(
  range: TimeRange,
  now: Date,
  options: {
    earliest?: string | null;
    from?: string;
    to?: string;
    granularity?: Granularity;
  } = {},
): ResolvedRange {
  const endOfToday = new Date(startOfUtcDay(now).getTime() + DAY_MS - 1);

  let from: Date;
  let to = endOfToday;

  switch (range) {
    case "today":
      from = startOfUtcDay(now);
      break;
    case "7d":
      from = new Date(startOfUtcDay(now).getTime() - 6 * DAY_MS);
      break;
    case "30d":
      from = new Date(startOfUtcDay(now).getTime() - 29 * DAY_MS);
      break;
    case "year":
      from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      break;
    case "all": {
      const first = options.earliest ? Date.parse(options.earliest) : Number.NaN;
      from = Number.isFinite(first)
        ? startOfUtcDay(new Date(first))
        : new Date(startOfUtcDay(now).getTime() - EMPTY_ALL_TIME_DAYS * DAY_MS);
      break;
    }
    case "custom": {
      const start = isoDay(options.from);
      const end = isoDay(options.to);
      if (!start || !end) {
        // Not an error: an unreadable date in a shared URL should still draw
        // something rather than an empty page with a message.
        from = new Date(startOfUtcDay(now).getTime() - 29 * DAY_MS);
        break;
      }
      // Swapped bounds are a slip, not an empty result. Accepting them as given
      // would produce `from > to` and a chart with no points at all.
      const [a, b] = start <= end ? [start, end] : [end, start];
      from = new Date(`${a}T00:00:00.000Z`);
      to = new Date(`${b}T23:59:59.999Z`);
      break;
    }
  }

  /*
   * `to` is never in the future beyond today. A custom range ending next month
   * would draw a tail of empty buckets that reads as a collapse in volume.
   */
  if (to.getTime() > endOfToday.getTime()) to = endOfToday;

  const auto = autoGranularity(from.getTime(), to.getTime());
  const granularity = options.granularity ?? auto;

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    // A manual choice that would blow the ceiling falls back to the automatic
    // one: "hourly over three years" is 26 000 points and a frozen browser.
    granularity: withinBudget(from, to, granularity) ? granularity : auto,
    label:
      range === "custom"
        ? `${from.toISOString().slice(0, 10)} – ${to.toISOString().slice(0, 10)}`
        : TIME_RANGE_LABELS[range],
  };
}

function withinBudget(from: Date, to: Date, granularity: Granularity): boolean {
  return bucketCount(from.getTime(), to.getTime(), granularity) <= MAX_BUCKETS;
}

function bucketCount(fromMs: number, toMs: number, granularity: Granularity): number {
  const span = Math.max(0, toMs - fromMs);
  switch (granularity) {
    case "hour":
      return span / 3_600_000 + 1;
    case "day":
      return span / DAY_MS + 1;
    case "week":
      return span / (7 * DAY_MS) + 1;
    case "month":
      return span / (30 * DAY_MS) + 1;
  }
}

/**
 * The bucket an instant belongs to, as a sortable key.
 *
 * A prefix of the ISO string wherever possible, so the same expression can be
 * used in SQLite via `substr` — the aggregation groups on exactly these keys and
 * the two must not disagree about where a week starts.
 *
 * Weeks start on Monday, because a support week does. ISO-8601 agrees, which is
 * also what makes `date(created_at, 'weekday 0', '-6 days')` the right SQLite
 * expression rather than a hand-rolled offset.
 */
export function bucketKey(iso: string, granularity: Granularity): string {
  switch (granularity) {
    case "hour":
      return `${iso.slice(0, 13)}:00`;
    case "day":
      return iso.slice(0, 10);
    case "month":
      return iso.slice(0, 7);
    case "week": {
      const at = new Date(iso);
      // getUTCDay: 0 is Sunday. Shifting by 6 makes Monday the first day.
      const back = (at.getUTCDay() + 6) % 7;
      return new Date(startOfUtcDay(at).getTime() - back * DAY_MS)
        .toISOString()
        .slice(0, 10);
    }
  }
}

/**
 * Every bucket in the range, in order, including the empty ones.
 *
 * Generated rather than derived from the rows, and that is the point: a chart
 * built only from buckets that have data draws a straight line across a weekend
 * with no tickets, which reads as steady volume instead of as a quiet Sunday.
 */
export function bucketsFor(range: ResolvedRange): string[] {
  const out: string[] = [];
  const end = Date.parse(range.to);

  let cursor = new Date(bucketStart(range.from, range.granularity));

  while (cursor.getTime() <= end && out.length < MAX_BUCKETS) {
    out.push(bucketKey(cursor.toISOString(), range.granularity));
    cursor = advance(cursor, range.granularity);
  }

  return out;
}

function bucketStart(iso: string, granularity: Granularity): number {
  const at = new Date(iso);
  switch (granularity) {
    case "hour":
      return Date.UTC(
        at.getUTCFullYear(),
        at.getUTCMonth(),
        at.getUTCDate(),
        at.getUTCHours(),
      );
    case "day":
      return startOfUtcDay(at).getTime();
    case "week": {
      const back = (at.getUTCDay() + 6) % 7;
      return startOfUtcDay(at).getTime() - back * DAY_MS;
    }
    case "month":
      return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1);
  }
}

function advance(at: Date, granularity: Granularity): Date {
  switch (granularity) {
    case "hour":
      return new Date(at.getTime() + 3_600_000);
    case "day":
      return new Date(at.getTime() + DAY_MS);
    case "week":
      return new Date(at.getTime() + 7 * DAY_MS);
    case "month":
      // Calendar arithmetic, not 30 days: adding milliseconds drifts and would
      // eventually emit the same month twice.
      return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  }
}

/** `14:00`, `03.08.`, `KW 32`, `Aug 2026` — short enough for an axis tick. */
export function bucketLabel(key: string, granularity: Granularity): string {
  switch (granularity) {
    case "hour":
      return `${key.slice(11, 13)}:00`;
    case "day":
      return `${key.slice(8, 10)}.${key.slice(5, 7)}.`;
    case "week":
      return `KW ${isoWeek(key)}`;
    case "month": {
      const month = Number(key.slice(5, 7));
      return `${MONTHS[month - 1] ?? key} ${key.slice(0, 4)}`;
    }
  }
}

const MONTHS = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

/**
 * ISO week number of a `YYYY-MM-DD` Monday.
 *
 * The Thursday rule, not "day of year over seven": the first week of a year is
 * the one containing its first Thursday, so the first days of January often
 * belong to week 52 or 53 of the previous year. Getting this wrong puts two
 * different weeks under one label at exactly the point in the year somebody is
 * comparing to last December.
 */
export function isoWeek(day: string): number {
  const at = new Date(`${day}T00:00:00.000Z`);
  const thursday = new Date(
    at.getTime() + ((3 - ((at.getUTCDay() + 6) % 7)) * DAY_MS),
  );
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const offset = (firstThursday.getUTCDay() + 6) % 7;
  const weekOne = new Date(firstThursday.getTime() - offset * DAY_MS);

  return Math.round((thursday.getTime() - weekOne.getTime()) / (7 * DAY_MS)) + 1;
}

export const isTimeRange = (value: unknown): value is TimeRange =>
  typeof value === "string" && (TIME_RANGES as readonly string[]).includes(value);

export const isGranularity = (value: unknown): value is Granularity =>
  typeof value === "string" && (GRANULARITIES as readonly string[]).includes(value);

/** `YYYY-MM-DD` only — anything else is dropped rather than fed to `Date`. */
function isoDay(value: string | undefined): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
