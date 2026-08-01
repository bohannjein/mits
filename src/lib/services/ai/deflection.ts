import { tokenize } from "@/lib/services/ai/similarity";
import type { PortalFaq } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Offering the FAQ article somebody is about to write a ticket about.

   **No model, no embeddings — and that is the design, not a shortcut.** Three
   reasons, in order of weight:

   1. It runs while somebody is typing. A round trip to a model on every pause is
      hundreds of milliseconds and a request per keystroke-burst per reporter; a
      set intersection over a few dozen FAQ entries is microseconds.
   2. An embedding index needs a vector store, a model to fill it, and a re-index
      whenever the FAQ changes. The third one is what breaks: the index drifts from
      the articles and starts recommending a text that no longer says that.
   3. The corpus is tiny and the vocabulary is shared. A reporter writing about
      their password and an article about resetting passwords use the same word.
      Paraphrase matching earns its cost on a large corpus of prose, not on
      forty helpdesk entries.

   Pure, so the offline suite owns the ranking. The failure mode is quiet in both
   directions — a suggestion nobody wanted is noise, a missing one is a ticket that
   did not need to exist.
   ────────────────────────────────────────────────────────────────────────── */

export interface DeflectionHit {
  id: string;
  question: string;
  /** 0 to 1. Exposed so the caller can require confidence, not just a best match. */
  score: number;
}

/**
 * How much of the query has to be covered before a suggestion is worth showing.
 *
 * Deliberately high. The instruction was "vollkommen unaufdringlich": a wrong
 * suggestion under somebody's half-typed problem is an interruption that says the
 * system misunderstood them, and two of those and they stop reading the area
 * entirely. A miss costs nothing — they file the ticket they were going to file.
 */
export const DEFLECTION_THRESHOLD = 0.34;

/** Nothing is matched against a fragment; the reporter is still typing. */
export const DEFLECTION_MIN_CHARS = 12;

/** Two links. Three is a menu, and a menu is a decision the reporter did not ask for. */
export const DEFLECTION_LIMIT = 2;

/**
 * A question's own words weigh more than its answer's.
 *
 * An answer is long, so it accumulates vocabulary and would match everything; the
 * question is the article's topic. The answer still counts, because it is where
 * the product names live — "M365", "OWA" — and those are exactly the words a
 * reporter uses.
 */
const ANSWER_WEIGHT = 0.4;

/**
 * Coverage of the query by an article, 0 to 1.
 *
 * Asymmetric on purpose, unlike the Jaccard used for clustering: what matters is
 * how much of *what the reporter wrote* the article covers. Jaccard would punish a
 * long, thorough article for containing words the query did not — which is the
 * wrong direction entirely, since the thorough article is the better answer.
 */
function coverage(query: Set<string>, question: Set<string>, answer: Set<string>): number {
  if (query.size === 0) return 0;

  let score = 0;
  for (const token of query) {
    if (question.has(token)) score += 1;
    else if (answer.has(token)) score += ANSWER_WEIGHT;
  }

  return score / query.size;
}

/**
 * FAQ entries worth offering for this text, best first.
 *
 * Returns an empty list far more often than not, which is the intended behaviour.
 */
export function suggestFaqs(
  text: string,
  faqs: PortalFaq[],
  options: { threshold?: number; limit?: number } = {},
): DeflectionHit[] {
  const threshold = options.threshold ?? DEFLECTION_THRESHOLD;
  const limit = options.limit ?? DEFLECTION_LIMIT;

  if (text.trim().length < DEFLECTION_MIN_CHARS) return [];

  const query = new Set(tokenize(text));
  if (query.size === 0) return [];

  return faqs
    .map((faq) => ({
      id: faq.id,
      question: faq.question,
      score: coverage(
        query,
        new Set(tokenize(faq.question)),
        new Set(tokenize(faq.answer)),
      ),
    }))
    .filter((hit) => hit.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
