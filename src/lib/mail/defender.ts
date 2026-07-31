import {
  TicketPriority,
  type TicketPriority as TicketPriorityValue,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Microsoft Defender alert recognition.

   Pure functions over an already-parsed message. No transport, no database, no
   `server-only` — which is what makes the whole classifier testable offline, and
   this is a classifier whose mistakes are expensive in both directions: a missed
   alert sits in a queue as an ordinary mail, and a false positive escalates a
   newsletter to a critical security incident and pages the on-call admin at 03:00.

   Everything here reads the message *as text*. Defender's HTML changes without
   notice and matching on its markup would break on a template revision; the words
   "Severity: High" survive that.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Senders Microsoft actually uses for security notifications.
 *
 * Matched on the domain part after the last `@`, exactly — the same rule the
 * registration allow-list uses, and for the same reason: a substring match would
 * accept `microsoft.com.evil.example`.
 */
const DEFENDER_DOMAINS = [
  "microsoft.com",
  "email.microsoft.com",
  "azure.microsoft.com",
  "securitycenter.windows.com",
  "protection.outlook.com",
];

/**
 * Subject shapes that mark an alert even when the sender is a relay.
 *
 * A tenant frequently forwards these through its own mail flow, so the address is
 * often a distribution list rather than Microsoft. The subject survives forwarding.
 */
const SUBJECT_PATTERNS = [
  /\[defender\s*alert\]/i,
  /\bdefender\s+for\s+(endpoint|office|cloud|identity)\b/i,
  /\bmicrosoft\s+defender\b/i,
  /\bincident\s*#\s*\d+/i,
  /\b(critical|high|medium|low)\s+severity\s+alert\b/i,
  /\bsecurity\s+alert\b.*\b(detected|triggered)\b/i,
];

/** Everything the classifier could pull out. Empty strings where it could not. */
export interface DefenderAlert {
  /** Why this was recognised, for the admin test view and the audit trail. */
  matchedOn: ("sender" | "subject")[];
  severity: DefenderSeverity | null;
  /** Device or account the alert is about. */
  host: string;
  /** The alert name, without Defender's prefixes. */
  alertTitle: string;
  /** Defender's own incident number, if the mail carries one. */
  incidentId: string;
}

export const DEFENDER_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type DefenderSeverity = (typeof DEFENDER_SEVERITIES)[number];

/**
 * Defender severity → MITS priority.
 *
 * `medium` and `low` deliberately do not collapse to `low`: a medium Defender finding
 * is still a security finding, and burying it under a printer request is how an alert
 * gets noticed a week later. Nothing here maps below `medium`.
 */
export const SEVERITY_TO_PRIORITY: Record<DefenderSeverity, TicketPriorityValue> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "medium",
};

const domainOf = (address: string): string => {
  const at = address.lastIndexOf("@");
  return at < 0 ? "" : address.slice(at + 1).trim().toLowerCase();
};

/**
 * Whether this message is a Defender alert, and what it says.
 *
 * Returns null rather than a "maybe": the caller escalates on the strength of this
 * answer, so an uncertain one has to be a no. A sender match alone is enough
 * (Microsoft security mail is what it is), and a subject match alone is enough (a
 * forwarded alert keeps its subject). Body text is only ever used to *extract*, never
 * to decide — a mail quoting an alert is not an alert.
 */
export function classifyDefenderAlert(message: {
  from: string;
  subject: string;
  text: string;
}): DefenderAlert | null {
  const matchedOn: DefenderAlert["matchedOn"] = [];

  if (DEFENDER_DOMAINS.includes(domainOf(message.from))) {
    matchedOn.push("sender");
  }
  if (SUBJECT_PATTERNS.some((pattern) => pattern.test(message.subject))) {
    matchedOn.push("subject");
  }

  if (matchedOn.length === 0) return null;

  return {
    matchedOn,
    severity: extractSeverity(message.subject, message.text),
    host: extractHost(message.text),
    alertTitle: extractAlertTitle(message.subject, message.text),
    incidentId: extractIncidentId(message.subject, message.text),
  };
}

/**
 * The severity, from the subject first and the body second.
 *
 * Subject first because it is the field a tenant's mail flow is least likely to
 * rewrite. Both are searched for the labelled form (`Severity: High`) before the bare
 * word, so the word "critical" inside a description cannot outvote the actual field.
 */
function extractSeverity(
  subject: string,
  text: string,
): DefenderSeverity | null {
  const labelled = /severity\s*[:\-]?\s*(critical|high|medium|low)/i;
  const german = /schweregrad\s*[:\-]?\s*(kritisch|hoch|mittel|niedrig)/i;

  const GERMAN: Record<string, DefenderSeverity> = {
    kritisch: "critical",
    hoch: "high",
    mittel: "medium",
    niedrig: "low",
  };

  for (const source of [subject, text]) {
    const hit = source.match(labelled);
    if (hit) return hit[1].toLowerCase() as DefenderSeverity;

    const localised = source.match(german);
    if (localised) return GERMAN[localised[1].toLowerCase()] ?? null;
  }

  // Last resort: the shape "High severity alert" in the subject line only. Not the
  // body — "high" appears in prose far too often to be evidence there.
  const inSubject = subject.match(/\b(critical|high|medium|low)\s+severity\b/i);
  return inSubject ? (inSubject[1].toLowerCase() as DefenderSeverity) : null;
}

/**
 * The device or account the alert concerns.
 *
 * Several labels because Defender's wording differs per product — Endpoint says
 * "Device", Office says "User", and forwarded German tenants say "Gerät". First hit
 * wins; the list is ordered most-specific first so "Device name" beats "Device".
 */
function extractHost(text: string): string {
  const labels = [
    /device\s*name\s*[:\-]\s*(.+)/i,
    /computer\s*name\s*[:\-]\s*(.+)/i,
    /host\s*name\s*[:\-]\s*(.+)/i,
    /ger[äa]tename\s*[:\-]\s*(.+)/i,
    /\bdevice\s*[:\-]\s*(.+)/i,
    /\bcomputer\s*[:\-]\s*(.+)/i,
    /\bhost\s*[:\-]\s*(.+)/i,
    /\bger[äa]t\s*[:\-]\s*(.+)/i,
    /\buser\s*[:\-]\s*(.+)/i,
    /\bbenutzer\s*[:\-]\s*(.+)/i,
  ];

  for (const label of labels) {
    const hit = text.match(label);
    if (!hit) continue;
    const value = firstLine(hit[1]);
    if (value) return value.slice(0, 120);
  }

  return "";
}

/**
 * The alert name.
 *
 * From the body's own label when there is one, otherwise the subject with Defender's
 * decoration removed — the bracketed tag, the severity words and the incident number
 * are metadata that already have their own fields, and repeating them in the title
 * makes a queue of alerts unreadable.
 */
function extractAlertTitle(subject: string, text: string): string {
  const labelled = text.match(/alert\s*(?:name|title)\s*[:\-]\s*(.+)/i);
  if (labelled) {
    const value = firstLine(labelled[1]);
    if (value) return value.slice(0, 160);
  }

  const stripped = subject
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\bincident\s*#\s*\d+/gi, " ")
    .replace(/\b(critical|high|medium|low)\s+severity(\s+alert)?\b/gi, " ")
    .replace(/\bmicrosoft\s+defender(\s+for\s+\w+)?\b/gi, " ")
    .replace(/\bsecurity\s+alert\b/gi, " ")
    .replace(/^\s*(re|aw|fwd?|wg)\s*:\s*/gi, " ")
    .replace(/[\s:–-]+/g, " ")
    .trim();

  return stripped.slice(0, 160);
}

function extractIncidentId(subject: string, text: string): string {
  for (const source of [subject, text]) {
    const hit = source.match(/incident\s*(?:id\s*)?#?\s*[:\-]?\s*(\d{1,12})/i);
    if (hit) return hit[1];
  }
  return "";
}

/** Labels are followed by a value on the same line; the rest of the mail is not it. */
function firstLine(value: string): string {
  return value.split(/[\r\n]/)[0].replace(/\s+/g, " ").trim();
}

/**
 * The priority an alert warrants, or null when the severity could not be read.
 *
 * Null rather than a guess. A recognised alert with an unreadable severity is still
 * urgent, but inventing "critical" from nothing would train people to ignore the
 * label — the caller falls back to `high` and records that it did.
 */
export function priorityForAlert(alert: DefenderAlert): TicketPriorityValue | null {
  if (!alert.severity) return null;
  return TicketPriority.parse(SEVERITY_TO_PRIORITY[alert.severity]);
}
