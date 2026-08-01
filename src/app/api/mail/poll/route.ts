import { timingSafeEqual } from "node:crypto";

import { canAdminister } from "@/lib/auth/roles";
import { serviceToken } from "@/lib/auth/secret";
import { getSessionUserFor } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/features";
import { ingestMailbox } from "@/lib/mail/ingest";

/* ──────────────────────────────────────────────────────────────────────────
   Fetch the support mailbox, for a scheduler.

   **There is no in-process timer, deliberately.** A `setInterval` in a Next
   server runs once per worker: two workers means every message is fetched twice
   and every mail becomes two tickets. It also keeps polling on an instance nobody
   is using, and it cannot be observed or paused from outside the process. A cron
   entry, a systemd timer or a Portainer job hitting this endpoint is the same
   capability with an off switch and a log.

       curl -X POST -H "X-MITS-Service-Token: $(cat data/service-token)" \
            http://mits.local:3000/api/mail/poll

   Two ways in, matching `lib/cmdb-api.ts`: the service token for a machine, or an
   admin session so the same URL can be opened in a browser. Outside the proxy's
   matcher, so a machine call gets JSON rather than a redirect to the login form.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Constant-time comparison, after a length check.
 *
 * `timingSafeEqual` throws on differing lengths, so the length is compared first —
 * and that comparison is not itself a leak worth worrying about: the token length
 * is a constant of this build, not a secret.
 */
function tokenMatches(provided: string): boolean {
  const expected = serviceToken();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const provided = request.headers.get("x-mits-service-token") ?? "";

  /*
   * Fail closed. An empty header never matches, because `serviceToken()` always
   * returns a generated value — there is no configuration in which the token check
   * is skipped rather than merely impossible to pass.
   */
  let authorized = provided !== "" && tokenMatches(provided);

  if (!authorized) {
    const user = await getSessionUserFor(request);
    authorized = user !== null && !user.mustChangePassword && canAdminister(user.role);
  }

  if (!authorized) {
    return Response.json({ error: "Nicht berechtigt." }, { status: 401 });
  }

  if (!isFeatureEnabled("feature_mail_inbound")) {
    // 409 rather than 404: the endpoint exists and the caller's request was well
    // formed — the module is off, which is something a scheduler's log should say
    // plainly rather than reporting as a broken URL.
    return Response.json(
      { error: "Der E-Mail-Abruf ist abgeschaltet." },
      { status: 409 },
    );
  }

  try {
    const report = await ingestMailbox();
    return Response.json({ report });
  } catch (error) {
    console.error("[MITS] Postfach-Abruf fehlgeschlagen:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Abruf fehlgeschlagen.",
      },
      { status: 502 },
    );
  }
}
