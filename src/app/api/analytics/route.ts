import { requireApiRole } from "@/lib/auth/session";
import { analyticsToCsv, csvFilename } from "@/lib/analytics/export";
import { collectAnalytics, earliestTicketAt } from "@/lib/analytics/queries";
import {
  isGranularity,
  isTimeRange,
  resolveRange,
  type Granularity,
  type TimeRange,
} from "@/lib/analytics/range";

/* ──────────────────────────────────────────────────────────────────────────
   The analytics figures, as JSON or as a CSV file.

   **Agent-gated, and that is the point of the endpoint existing at all.** These
   numbers name who filed how many tickets and how fast each agent closes them —
   a reporter has no business with either. `requireApiRole("agent")` answers 403
   for a signed-in reporter rather than 404: unlike a ticket id, the existence of
   this endpoint is not a secret, and a 404 would send somebody hunting for a typo
   in a URL that is perfectly correct.

   One endpoint for both shapes rather than two. The CSV has to be exactly what
   the panel is showing, and a second route computing it separately is a second
   place for the range parsing to drift.
   ────────────────────────────────────────────────────────────────────────── */

export async function GET(request: Request) {
  const auth = await requireApiRole("agent", request);
  if ("response" in auth) return auth.response;

  const params = new URL(request.url).searchParams;

  /*
   * Validated against the enums rather than passed through, and falling back
   * rather than erroring — the same rule `parseTicketQuery` follows. A stale
   * bookmark should draw the last thirty days, not a stack trace.
   */
  const rangeKey: TimeRange = isTimeRange(params.get("range"))
    ? (params.get("range") as TimeRange)
    : "30d";
  const granularity: Granularity | undefined = isGranularity(
    params.get("granularity"),
  )
    ? (params.get("granularity") as Granularity)
    : undefined;

  const range = resolveRange(rangeKey, new Date(), {
    earliest: rangeKey === "all" ? earliestTicketAt() : null,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    granularity,
  });

  const data = collectAnalytics(range);

  if (params.get("format") === "csv") {
    /*
     * A BOM, deliberately. Excel reads a UTF-8 file without one as the system
     * codepage, so every umlaut in a German ticket title arrives mangled — and
     * the person who exported it has no way to tell that the file was fine.
     */
    return new Response(`﻿${analyticsToCsv(data)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename(new Date())}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Never cached: the whole value of this endpoint is that two requests a few
  // seconds apart can differ.
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
