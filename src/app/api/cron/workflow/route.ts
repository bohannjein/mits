import { timingSafeEqual } from "node:crypto";

import { canAdminister } from "@/lib/auth/roles";
import { serviceToken } from "@/lib/auth/secret";
import { getSessionUserFor } from "@/lib/auth/session";
import { sweepWorkflow } from "@/lib/ticket-sweeper";
import { getWorkflowSettings } from "@/lib/workflow-settings";
import { hasAutoClose } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Stillstehende Tickets aufräumen.

   **Anders als `/api/cron/reminders` schreibt dieser Endpunkt.** Jener
   veröffentlicht ein inhaltsloses Signal und ist für die Pünktlichkeit einer
   Erinnerung zuständig; hier werden Tickets geschlossen und Mail an Melder
   verschickt. Zwei Endpunkte und nicht einer, weil ein Scheduler die beiden
   verschieden oft anstoßen will — der eine jede Minute, dieser einmal am Tag —
   und weil eine gemeinsame Antwort nicht mehr sagen könnte, welche Hälfte
   gescheitert ist.

       curl -X POST -H "X-MITS-Service-Token: $(cat data/service-token)" \
            http://mits.local:3000/api/cron/workflow

   Einmal täglich ist der sinnvolle Eintrag. Die Fristen sind in Tagen, öfter
   ändert also nichts am Ergebnis und liest bei jedem Lauf den Bestand.

   Zwei Wege hinein, wie bei `/api/mail/poll` und `/api/cron/reminders`: der
   Service-Token für einen Scheduler, oder eine Admin-Sitzung, damit die URL im
   Browser aufgerufen werden kann, um zu sehen, was sie meldet.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Constant-time comparison, after a length check.
 *
 * In der Form von `/api/cron/reminders` übernommen statt geteilt:
 * `timingSafeEqual` wirft bei ungleicher Länge, die wird also zuerst verglichen,
 * und das ist kein Leck — die Tokenlänge ist eine Konstante dieses Builds.
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

  // Fail closed: ein leerer Header trifft nie, weil `serviceToken()` immer einen
  // erzeugten Wert liefert. Es gibt keine Konfiguration, in der die Prüfung
  // übersprungen statt bloß unbestehbar wird.
  let authorized = provided !== "" && tokenMatches(provided);

  if (!authorized) {
    const user = await getSessionUserFor(request);
    authorized =
      user !== null && !user.mustChangePassword && canAdminister(user.role);
  }

  if (!authorized) {
    return Response.json({ error: "Nicht berechtigt." }, { status: 401 });
  }

  /*
   * 409 und nicht 200 mit leerem Ergebnis: ein Scheduler-Log soll „nichts
   * eingestellt" von „nichts zu tun" unterscheiden können. Beides als Erfolg zu
   * melden hieße, dass eine versehentlich auf 0 gesetzte Frist wie ein ruhiger
   * Tag aussieht.
   */
  if (!hasAutoClose(getWorkflowSettings())) {
    return Response.json(
      { error: "Es ist keine Verfallsfrist eingestellt." },
      { status: 409 },
    );
  }

  const result = await sweepWorkflow();

  // Zahlen, keine Ids: ein Scheduler-Log liegt so lange, wie das Log aufgehoben
  // wird, und eine Ticketliste darin ist eine Kundendatenspur außerhalb der
  // Anwendung.
  return Response.json({ ok: true, ...result });
}
