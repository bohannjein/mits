import {
  classifyDefenderAlert,
  priorityForAlert,
  type DefenderAlert,
} from "@/lib/mail/defender";
import { cleanInboundReply } from "@/lib/mail/quotes";
import { SECURITY_INCIDENT_SCHEMA } from "@/lib/mock-schemas";
import type { TicketPriority } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The "Defender Security Incident Handler" rule.

   A pure function that turns an inbound message into a *plan*: which schema, which
   payload, which priority, who to assign it to, whom to notify. It writes nothing.

   That split is the point. The rule is the part with the interesting decisions and the
   expensive mistakes — escalating a newsletter, or failing to escalate a real alert —
   so it has to be exercisable without a mailbox, a database or a clock. The caller does
   the writing and is dull enough to read.

   Also why the rule is code and not a row in an automation table: this is the one rule
   MITS ships with, its conditions are specific to Defender's mail format, and a
   generic condition builder that could express "read the severity out of the body"
   would be a small programming language. A configurable engine can come later and have
   this as its first entry; inventing the engine first would mean inventing it blind.
   ────────────────────────────────────────────────────────────────────────── */

/** What the rule needs to know about the instance. */
export interface IncidentRuleConfig {
  /**
   * The account that gets the ticket. Null when the admin has not nominated one — the
   * ticket is then left unassigned rather than pushed at an arbitrary technician, and
   * it shows up in the pool inbox where somebody will see it.
   */
  onCallUserId: string | null;
  /** Where to send the immediate notification. Empty means no mail is attempted. */
  onCallEmail: string;
  /** Off switches the whole rule; a recognised alert then becomes an ordinary ticket. */
  enabled: boolean;
}

export interface InboundMessage {
  from: string;
  subject: string;
  text: string;
}

export interface IncidentPlan {
  /** The alert as recognised. Kept so the admin test view can show its reasoning. */
  alert: DefenderAlert;
  formSchemaId: string;
  payload: Record<string, unknown>;
  title: string;
  priority: TicketPriority;
  /** True when the severity was unreadable and the priority is the fallback. */
  priorityAssumed: boolean;
  assignTo: string | null;
  notify: string;
  /** Human-readable trail of what the rule did, for the ticket's first note. */
  reasons: string[];
}

/**
 * The fallback when an alert is recognised but its severity is not.
 *
 * `high`, not `medium`: something addressed itself to us as a security alert. Treating
 * an unreadable one as routine is the failure that gets noticed a week later, and the
 * plan records that the value was assumed so nobody mistakes it for Defender's own.
 */
const ASSUMED_PRIORITY: TicketPriority = "high";

/**
 * Apply the rule, or return null when it does not fire.
 *
 * Null covers both "not an alert" and "rule switched off", because the caller does the
 * same thing in either case: create an ordinary mail ticket. The distinction is only
 * interesting to the admin test view, which asks `classifyDefenderAlert` directly.
 */
export function planSecurityIncident(
  message: InboundMessage,
  config: IncidentRuleConfig,
): IncidentPlan | null {
  if (!config.enabled) return null;

  const alert = classifyDefenderAlert(message);
  if (!alert) return null;

  const reasons: string[] = [
    `Erkannt als Microsoft-Defender-Alert (${alert.matchedOn
      .map((source) => (source === "sender" ? "Absender" : "Betreff"))
      .join(" und ")}).`,
  ];

  const derived = priorityForAlert(alert);
  const priorityAssumed = derived === null;
  const priority = derived ?? ASSUMED_PRIORITY;

  reasons.push(
    priorityAssumed
      ? `Schweregrad nicht lesbar — Priorität auf „${priority}" gesetzt, damit der Alert nicht untergeht.`
      : `Schweregrad ${alert.severity} → Priorität ${priority}.`,
  );

  if (config.onCallUserId) {
    reasons.push("Der Bereitschaft zugewiesen.");
  } else {
    // Said out loud: an unassigned incident is a deliberate outcome here, not a bug,
    // but it does depend on somebody watching the pool inbox.
    reasons.push(
      "Keine Bereitschaft hinterlegt — der Vorfall bleibt unzugewiesen und liegt im Eingang.",
    );
  }

  const title = alert.alertTitle || message.subject.trim() || "Security Incident";

  return {
    alert,
    formSchemaId: SECURITY_INCIDENT_SCHEMA.id,
    payload: {
      title: title.slice(0, 160),
      severity: alert.severity ?? "high",
      host: alert.host,
      incident_id: alert.incidentId,
      source: "defender",
      // Quotes and footers stripped: a Defender mail carries a long legal footer, and
      // it is noise in every single incident.
      detail: cleanInboundReply(message.text).slice(0, 8000),
    },
    title: title.slice(0, 160),
    priority,
    priorityAssumed,
    assignTo: config.onCallUserId,
    notify: config.onCallEmail.trim(),
    reasons,
  };
}
