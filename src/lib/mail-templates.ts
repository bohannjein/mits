import { DEFAULT_TIMEZONE, formatDateTime } from "@/lib/format";
import { formatTicketNumber, type MITSTicket } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Mail bodies.

   Deliberately without `import "server-only"`, unlike everything else that feeds
   the mail path: these are pure string functions with no database access, and
   dropping the guard is what lets `scripts/verify-forms.mts` assert on the
   escaping. An unescaped ticket title in an HTML mail is an injection into
   someone's inbox, which is worth a test more than it is worth the import guard.

   ── The one documented exception to rule 2 ──

   Every colour here is a literal hex value and every style is inline. That is
   not sloppiness: mail clients strip <style> blocks, do not resolve CSS custom
   properties, and Outlook renders with Word's engine. `bg-background` and
   `var(--card)` would arrive as unstyled text. Tables carry the layout for the
   same reason — flexbox is unreliable across clients.

   The palette below mirrors the light theme in globals.css. An inbox is not
   themed, so the light values are the right ones; keep them in step by hand if
   the tokens change.
   ────────────────────────────────────────────────────────────────────────── */

const COLORS = {
  page: "#f8fafd",
  card: "#ffffff",
  border: "#e3e6ea",
  text: "#1f2124",
  muted: "#5f6368",
  accent: "#0b57d0",
  buttonText: "#ffffff",
} as const;

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Minimal escaping — every value below is user- or admin-authored. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Preserve the line breaks people typed, without allowing markup. */
function escMultiline(value: string): string {
  return esc(value).replace(/\r?\n/g, "<br>");
}

interface Section {
  /** Rendered as a paragraph. */
  text?: string;
  /** Rendered as a quoted block — used for an agent's reply. */
  quote?: { author: string; body: string };
}

/**
 * Wrap content in the shared frame.
 *
 * `url` is optional: without a configured public address there is no absolute
 * link to build, and a button pointing at `/tickets/…` in an inbox goes nowhere.
 * The mail then explains where to look instead.
 */
function layout(options: {
  heading: string;
  intro: string;
  sections: Section[];
  url: string | null;
  footer: string;
}): { html: string; text: string } {
  const blocks = options.sections
    .map((section) => {
      if (section.quote) {
        return `
          <div style="margin:0 0 16px;padding:12px 16px;border-left:3px solid ${COLORS.accent};background:${COLORS.page};border-radius:0 8px 8px 0;">
            <div style="margin:0 0 6px;font-size:13px;color:${COLORS.muted};">${esc(section.quote.author)}</div>
            <div style="font-size:15px;line-height:1.6;color:${COLORS.text};">${escMultiline(section.quote.body)}</div>
          </div>`;
      }
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${COLORS.text};">${escMultiline(section.text ?? "")}</p>`;
    })
    .join("");

  const button = options.url
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
        <tr>
          <td style="border-radius:999px;background:${COLORS.accent};">
            <a href="${esc(options.url)}"
               style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:500;color:${COLORS.buttonText};text-decoration:none;border-radius:999px;">
              Ticket im Browser öffnen
            </a>
          </td>
        </tr>
      </table>`
    : `<p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:${COLORS.muted};">
         Das Ticket ist im MITS-Portal unter „Meine Tickets“ zu finden.
       </p>`;

  const html = `<!-- MITS -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLORS.page};margin:0;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:16px;">
        <tr>
          <td style="padding:28px 28px 8px;font-family:${FONT};">
            <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.muted};">MITS IT-Service</div>
            <h1 style="margin:8px 0 4px;font-size:22px;font-weight:500;line-height:1.3;color:${COLORS.text};">${esc(options.heading)}</h1>
            <p style="margin:0 0 20px;font-size:14px;color:${COLORS.muted};">${esc(options.intro)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 8px;font-family:${FONT};">${blocks}${button}</td>
        </tr>
        <tr>
          <td style="padding:20px 28px 24px;font-family:${FONT};border-top:1px solid ${COLORS.border};">
            <p style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.muted};">${esc(options.footer)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

  // Every mail carries a plain-text alternative. Some clients prefer it, some
  // spam filters penalise its absence, and it is what a screen reader reads.
  const textBlocks = options.sections
    .map((section) =>
      section.quote
        ? `${section.quote.author}:\n${section.quote.body}`
        : (section.text ?? ""),
    )
    .join("\n\n");

  const text = [
    options.heading,
    options.intro,
    "",
    textBlocks,
    "",
    options.url ? `Ticket öffnen: ${options.url}` : "Zu finden im MITS-Portal unter „Meine Tickets“.",
    "",
    options.footer,
  ].join("\n");

  return { html, text };
}

/** Sent once, when a ticket has been filed. */
/**
 * `timeZone` is a parameter rather than a lookup: this module is imported by the
 * offline test script, so it must stay free of `server-only` imports. A mail is also
 * sent outside any request, so there is no context to read it from — the caller,
 * which is inside one, passes it in.
 */
export function ticketCreatedMail(
  ticket: MITSTicket,
  url: string | null,
  timeZone: string = DEFAULT_TIMEZONE,
) {
  const number = formatTicketNumber(ticket.ticket_number);

  const { html, text } = layout({
    heading: `Ticket ${number} ist eingegangen`,
    intro: ticket.title,
    sections: [
      {
        text: `Ihre Meldung liegt bei der IT und wird bearbeitet. Sobald es etwas zu berichten gibt, erhalten Sie eine Nachricht an diese Adresse.`,
      },
      {
        text: `Ticket-Nummer: ${number}\nEingegangen am: ${formatDateTime(ticket.created_at, timeZone)}`,
      },
    ],
    url,
    footer:
      "Diese Nachricht wurde automatisch erzeugt. Antworten Sie bitte im Ticket, nicht auf diese E-Mail.",
  });

  return { subject: `[${number}] Ticket eingegangen: ${ticket.title}`, html, text };
}

/**
 * Sent when an agent posts a public reply.
 *
 * Only ever called with a public comment — an internal note must never reach the
 * reporter, and the trigger in `addCommentAction` checks visibility before it
 * gets here.
 */
export function ticketReplyMail(
  ticket: MITSTicket,
  reply: { author: string; body: string },
  url: string | null,
) {
  const number = formatTicketNumber(ticket.ticket_number);

  const { html, text } = layout({
    heading: `Neue Antwort zu ${number}`,
    intro: ticket.title,
    sections: [
      { text: "Die IT hat auf Ihre Meldung geantwortet:" },
      { quote: reply },
    ],
    url,
    footer:
      "Diese Nachricht wurde automatisch erzeugt. Antworten Sie bitte im Ticket, nicht auf diese E-Mail.",
  });

  return { subject: `[${number}] Neue Antwort: ${ticket.title}`, html, text };
}

/** The "send test mail" button in the settings mask. */
export function testMail(recipient: string, url: string | null) {
  const { html, text } = layout({
    heading: "SMTP-Test erfolgreich",
    intro: `Diese Nachricht ging an ${recipient}.`,
    sections: [
      {
        text: "Wenn diese E-Mail lesbar ankommt, kann MITS Benachrichtigungen versenden: Eingangsbestätigungen und Antworten der Technik.",
      },
      {
        text: url
          ? "Der Button unten benutzt die konfigurierte öffentliche Adresse. Führt er ins Leere, stimmt diese Adresse nicht."
          : "Es ist keine öffentliche Adresse konfiguriert — Benachrichtigungen gehen deshalb ohne Link auf das Ticket hinaus.",
      },
    ],
    url,
    footer: "Testnachricht aus /admin/settings/email.",
  });

  return { subject: "MITS — SMTP-Test", html, text };
}
