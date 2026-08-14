import { tokenize } from "@/lib/services/ai/similarity";
import type { TicketPriority, TriageRule } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Filing an incoming ticket by the words in it.

   **Rules, not a model, and that is the decision.** `services/ai/routing.ts`
   already asks a model where a ticket belongs, and it deliberately writes the
   answer as a *tag* — a suggestion an agent reads — because a model that moves
   tickets between queues moves some of them wrongly and nobody knows which. That
   reasoning has not changed. What is new here is a second mechanism that is
   allowed to write, precisely because it is one an admin authored, can read back,
   and can be told about after the fact: rule „Drucker → Hardware/Drucker" filed
   this ticket, and the audit row says so.

   No `server-only`: three callers — the create path, the FAQ hints in the intake,
   and the offline suite. Same reason `lib/csv.ts` and `services/ai/tags.ts` carry
   none. Everything here is pure; the rules themselves come from
   `lib/triage-rules.ts`, which is the half that touches the database.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Shortest keyword that may match as a prefix rather than as a whole word.
 *
 * German compounds are the entire reason this exists. „Druckereinstellungen",
 * „Notebookakku" and „VPN-Verbindungsproblem" are single tokens, and a rule that
 * only matched whole words would miss every one of them — which is most of how
 * people actually write. Five characters is the floor because below it the prefix
 * rule starts firing on unrelated words: „mail" would match „mailand", and „netz"
 * matches half the vocabulary.
 */
export const KEYWORD_PREFIX_MIN = 5;

/** How many articles the intake offers at once. Same reasoning as `DEFLECTION_LIMIT`. */
export const TRIAGE_FAQ_LIMIT = 3;

/**
 * How many catalogue forms the intake offers at once.
 *
 * Same number and the same reasoning as the articles above: a column of eight
 * suggestions beside a half-written sentence is a second catalogue, and the
 * catalogue already has a tab of its own.
 */
export const TRIAGE_FORM_LIMIT = 3;

export interface TriageMatch {
  rule: TriageRule;
  /** Distinct keywords of this rule that were found. Never empty for a match. */
  hits: string[];
}

export interface TriageOutcome {
  /** The rule that decided, or null when nothing matched. */
  match: TriageMatch | null;
  /** Empty when the winning rule states no category. */
  categoryId: string;
  /** Only ever an increase; empty means "leave it alone". */
  priority: TicketPriority | "";
  /** Every matching rule's articles, deduplicated, best rule first. */
  faqIds: string[];
  /**
   * Every matching rule's catalogue forms, deduplicated, best rule first.
   *
   * Read by the intake and by nothing else. `applyTriage` never touches it: a form
   * is an offer to the person still typing, not something written onto an incoming
   * ticket — the create path, the mail ingest and REST have nobody to offer it to.
   */
  formSchemaIds: string[];
}

/**
 * Whether any enabled rule could ever suggest a form that exists here.
 *
 * One expression, two callers, and that is the reason it is a function: the intake
 * page reserves the suggestion column with it on the server, and the container
 * decides its own grid with it in the browser. Two copies would be two answers to
 * „is there a second column", and the disagreement renders as a squeezed composer.
 *
 * Checked against the ids actually on offer, so a rule pointing at a deleted or
 * role-hidden form does not reserve a column that stays empty for everyone.
 */
export function hasFormSuggestions(
  rules: TriageRule[],
  schemaIds: string[],
): boolean {
  return rules.some(
    (rule) =>
      rule.enabled &&
      rule.form_schema_ids.some((id) => schemaIds.includes(id)),
  );
}

/**
 * Whether one keyword occurs in a tokenised text.
 *
 * Exact token first, then the prefix rule above. Not `text.includes(keyword)`:
 * that matches across word boundaries and inside unrelated words — „app" would
 * fire on „Zugklappe", and the rule that files everything under the wrong
 * category is the one nobody trusts afterwards.
 */
export function matchesKeyword(tokens: string[], keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return false;
  if (tokens.includes(needle)) return true;
  if (needle.length < KEYWORD_PREFIX_MIN) return false;
  return tokens.some((token) => token.startsWith(needle));
}

/**
 * Every enabled rule that this text triggers, strongest first.
 *
 * "Strongest" is the number of distinct keywords found, not their total count: a
 * ticket that says „Drucker" eight times is one piece of evidence about printers,
 * while one that says „Drucker" and „Toner" is two. Ties fall back to
 * `order_index`, so the admin's ordering is what breaks them — which makes the
 * list in the settings mask meaningful rather than decorative.
 */
export function matchTriageRules(text: string, rules: TriageRule[]): TriageMatch[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];

  return rules
    .filter((rule) => rule.enabled)
    .map((rule) => ({
      rule,
      hits: [...new Set(rule.keywords.map((word) => word.trim().toLowerCase()))]
        .filter((word) => word !== "")
        .filter((word) => matchesKeyword(tokens, word)),
    }))
    .filter((candidate) => candidate.hits.length > 0)
    .sort(
      (a, b) =>
        b.hits.length - a.hits.length ||
        a.rule.order_index - b.rule.order_index,
    );
}

/**
 * What the rules make of a ticket's text.
 *
 * The category comes from the strongest rule *that names one*, not simply from
 * the strongest rule: a rule may exist only to offer articles („Passwort" → two
 * FAQ entries, no category), and letting it win would mean a better-matching
 * filing rule below it never applies. The articles and the forms, by contrast,
 * come from every match — somebody writing about a notebook that will not connect
 * to the VPN is asking both questions.
 */
export function triage(text: string, rules: TriageRule[]): TriageOutcome {
  const matches = matchTriageRules(text, rules);

  const deciding =
    matches.find((candidate) => candidate.rule.category_id !== "") ?? null;

  const faqIds: string[] = [];
  const formSchemaIds: string[] = [];
  for (const candidate of matches) {
    for (const id of candidate.rule.faq_ids) {
      if (!faqIds.includes(id)) faqIds.push(id);
    }
    // Same walk, same reason: somebody writing about a notebook that will not
    // connect to the VPN may well be offered both forms.
    for (const id of candidate.rule.form_schema_ids) {
      if (!formSchemaIds.includes(id)) formSchemaIds.push(id);
    }
  }

  return {
    match: deciding ?? matches[0] ?? null,
    categoryId: deciding?.rule.category_id ?? "",
    // From the deciding rule, so priority and category come from one statement.
    // A raise attached to a rule that did not file the ticket would be a change
    // nobody can trace back to a reason.
    priority: deciding?.rule.priority ?? "",
    faqIds: faqIds.slice(0, TRIAGE_FAQ_LIMIT),
    formSchemaIds: formSchemaIds.slice(0, TRIAGE_FORM_LIMIT),
  };
}
