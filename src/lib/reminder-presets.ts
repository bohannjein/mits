/* ──────────────────────────────────────────────────────────────────────────
   When "morgen 09:00" actually is.

   No `server-only`: the popover needs the labels and the server needs the
   instant, and the one thing that must not exist twice is the arithmetic. A
   client that computed the due time and posted it would also be a client that
   could post any due time — but that is not why this is shared. It is shared
   because two implementations of "tomorrow at nine" disagree twice a year, and
   the failure is a reminder that fires an hour early on the last Sunday in
   October.

   `now` is a parameter rather than read from the clock, which is what makes this
   testable at all — and the offline suite owns it.
   ────────────────────────────────────────────────────────────────────────── */

import { isReminderPreset, type ReminderPreset } from "@/types/mits";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The hour "morgen früh" means. Not configurable; see `REMINDER_PRESETS`. */
export const MORNING_HOUR = 9;

/**
 * How far ahead a hand-picked date may sit.
 *
 * Two years, which is not a business rule — it is a guard against a mistyped
 * year turning a reminder into a row that is never due and never cleaned up.
 */
export const MAX_REMINDER_AHEAD_MS = 2 * 365 * DAY_MS;

/**
 * The wall-clock reading of an instant in a timezone.
 *
 * `Intl` is the only timezone database in the runtime, so the reading is taken
 * by formatting and parsing back. `en-CA` because it yields `YYYY-MM-DD`, which
 * needs no month-name table.
 */
function partsIn(at: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);

  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type)?.value ?? "0";
    return Number(found);
  };

  // `hour12: false` still yields 24 for midnight in some ICU versions.
  const hour = value("hour") % 24;

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour,
    minute: value("minute"),
  };
}

/**
 * The instant at which a given wall-clock time occurs in a timezone.
 *
 * Two passes, and the second one is not optional. The first guess treats the
 * wall time as if it were UTC and is therefore wrong by the zone's offset; the
 * correction is that offset, measured by reading the guess back. A single pass
 * lands in the wrong hour for every zone but UTC, and a *third* pass is what
 * handles the DST boundary where the offset at the guess differs from the offset
 * at the answer — an hour wrong twice a year, on exactly the reminders that were
 * set across the switch.
 */
export function instantForZonedTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let guess = wanted;
  for (let pass = 0; pass < 2; pass += 1) {
    const read = partsIn(new Date(guess), timeZone);
    const readAsUtc = Date.UTC(
      read.year,
      read.month - 1,
      read.day,
      read.hour,
      read.minute,
      0,
      0,
    );
    const drift = wanted - readAsUtc;
    if (drift === 0) break;
    guess += drift;
  }

  return new Date(guess);
}

/**
 * The due instant for a preset.
 *
 * `hours-2` and `days-3` are plain offsets and deliberately *not* snapped to a
 * wall clock: "in 2 Stunden" means two hours from now, and rounding it to the
 * next half hour would make the shortest preset the one that lies most. Only
 * `tomorrow-9` names a time of day, and only it needs the timezone.
 */
export function reminderDueAt(
  preset: ReminderPreset,
  now: Date,
  timeZone: string,
): Date {
  switch (preset) {
    case "hours-2":
      return new Date(now.getTime() + 2 * HOUR_MS);
    case "days-3":
      return new Date(now.getTime() + 3 * DAY_MS);
    case "tomorrow-9": {
      const today = partsIn(now, timeZone);
      /*
       * Tomorrow by calendar day in that zone, then nine in the morning of it.
       *
       * Adding a day to the *instant* would be wrong at both ends: 23:30 plus
       * 24 h is the day after tomorrow's small hours in some zones, and a DST
       * day is not 24 hours long. `Date.UTC` normalises the overflow, so the
       * 31st plus one is the 1st without a month table.
       */
      const tomorrow = new Date(
        Date.UTC(today.year, today.month - 1, today.day + 1),
      );
      return instantForZonedTime(
        tomorrow.getUTCFullYear(),
        tomorrow.getUTCMonth() + 1,
        tomorrow.getUTCDate(),
        MORNING_HOUR,
        0,
        timeZone,
      );
    }
  }
}

/**
 * A hand-typed `datetime-local` value as an instant, or null.
 *
 * The browser sends `2026-08-05T14:30` with no zone, because that is what the
 * input is — a wall-clock reading. Feeding it to `new Date()` would interpret it
 * in the *server's* zone, so an instance in UTC would file a Berlin agent's
 * 14:30 as 16:30 local. Parsed by hand and resolved through the instance's zone,
 * which is the same zone every timestamp in MITS is displayed in.
 */
export function parseLocalDateTime(
  value: string,
  timeZone: string,
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const at = instantForZonedTime(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    timeZone,
  );

  return Number.isFinite(at.getTime()) ? at : null;
}

/**
 * The due instant a request asked for, whichever way it asked.
 *
 * One function for both paths, because both end in the same column and the
 * bounds have to be the same. Returns null for anything unusable — a preset that
 * is not one, an unparseable date, a time in the past, or one so far ahead that
 * it is a typo rather than an intention.
 *
 * "In the past" is rejected rather than clamped to now: a reminder that fires
 * the instant it is created looks like the button is broken, and the honest
 * answer is that the date was wrong.
 */
export function resolveReminderDue(
  input: { preset?: string | null; at?: string | null },
  now: Date,
  timeZone: string,
): Date | null {
  const due = isReminderPreset(input.preset)
    ? reminderDueAt(input.preset, now, timeZone)
    : input.at
      ? parseLocalDateTime(input.at, timeZone)
      : null;

  if (!due) return null;
  if (due.getTime() <= now.getTime()) return null;
  if (due.getTime() - now.getTime() > MAX_REMINDER_AHEAD_MS) return null;

  return due;
}
