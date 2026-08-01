"use client";

import { useEffect, useState } from "react";

import { useTimezone } from "@/components/providers/timezone-provider";
import { formatDateTime, formatDateTimeShort, formatRelativeTime } from "@/lib/format";

/* ──────────────────────────────────────────────────────────────────────────
   A timestamp that ages.

   The first render — server and the hydration pass that has to match it — shows
   the absolute short form. Only after mounting does it switch to `vor 12 Min.`.

   That is not a loading state, it is the fix for a real problem: a relative label
   is computed from `Date.now()`, the server and the browser read that clock a
   second or two apart, and "vor 59 Sek." versus "vor 1 Min." is a hydration
   mismatch on every ticket in the thread. Both forms are correct information, so
   nothing on screen is ever wrong — it changes format, not meaning.

   The exact instant lives in `title` in both states. A relative age is the right
   default for a conversation and useless the moment somebody has to quote it.
   ────────────────────────────────────────────────────────────────────────── */

export function RelativeTime({
  date,
  className,
}: {
  date: Date;
  className?: string;
}) {
  const timezone = useTimezone();
  // Null until mounted, which is what keeps the first client render identical to
  // the server's. Re-read every 30 s so a thread left open does not keep claiming
  // the last reply arrived "gerade eben".
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <time
      dateTime={date.toISOString()}
      title={formatDateTime(date, timezone)}
      className={className}
    >
      {now === null
        ? formatDateTimeShort(date, timezone)
        : formatRelativeTime(date, now)}
    </time>
  );
}
