/* ──────────────────────────────────────────────────────────────────────────
   Finding tickets that are the same outage.

   **Arithmetic, not a model.** Grouping is the part that has to be right and
   cheap: it runs on every queue render, and a wrong answer either invents an
   outage or hides one. Token overlap is deterministic, testable at the
   boundaries, costs nothing, and works on an instance with no model configured at
   all. The model is used for one thing only — writing the headline once a group
   exists — and if it is unavailable the banner still appears with a plain title.

   That is also why this file is pure and carries no `server-only`: it is the
   piece where an off-by-one silently merges two unrelated incidents, and the
   offline suite is the only place that gets to see it happen.

   No embeddings. A vector index over ticket titles needs a store, a re-index job
   and a model to produce the vectors, and it would earn its keep on paraphrases —
   which is not what an outage looks like. Twelve people reporting the same broken
   mail server write the same four words.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Words that appear in every second ticket and carry no topic.
 *
 * German and English, plus the helpdesk filler that is technically meaningful and
 * useless for grouping — "problem", "fehler", "geht nicht". Without them a burst
 * of unrelated tickets all containing "Problem mit" clusters into one outage.
 */
const STOPWORDS = new Set([
  // German function words
  "aber", "alle", "allen", "als", "also", "auch", "auf", "aus", "bei", "beim",
  "bin", "bis", "bitte", "dann", "das", "dass", "dem", "den", "der", "des",
  "die", "diese", "diesem", "diesen", "dieser", "doch", "dort", "durch", "ein",
  "eine", "einem", "einen", "einer", "eines", "einfach", "etwas", "für", "gar",
  "hab", "habe", "haben", "hat", "hatte", "heute", "hier", "ich", "ihr", "immer",
  "ist", "kann", "kein", "keine", "können", "leider", "man", "mehr", "mein",
  "meine", "mich", "mir", "mit", "nach", "nicht", "nichts", "noch", "nun", "nur",
  "oder", "ohne", "schon", "sehr", "sein", "seit", "sich", "sie", "sind", "soll",
  "über", "und", "uns", "unser", "vom", "von", "vor", "war", "was", "weil",
  "wenn", "werden", "wie", "wir", "wird", "wieder", "würde", "zum", "zur", "zwar",
  // Helpdesk filler: true of almost every ticket, so it groups nothing
  "anfrage", "fehler", "fehlermeldung", "hilfe", "meldung", "problem", "störung",
  "ticket",
  // English
  "and", "are", "but", "can", "cannot", "does", "for", "from", "have", "help",
  "issue", "not", "the", "this", "was", "with", "you", "your", "error",
]);

/** Below this a token is an article, an initial or a fragment. */
const MIN_TOKEN = 3;

/**
 * Words worth comparing.
 *
 * Split on everything that is not a letter or a digit, so `outlook.exe`,
 * `VPN-Zugang` and `Fehler: 0x83` all break into their parts. The umlauts stay —
 * folding them would merge `schön` and `schon`, and German helpdesk text is full
 * of both.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= MIN_TOKEN && !STOPWORDS.has(token));
}

/**
 * Jaccard overlap of two token sets, 0 to 1.
 *
 * Set-based, so repeating a word does not raise the score — twelve mentions of
 * "Drucker" in one long ticket must not make it look like every other printer
 * ticket. Two empty texts score 0 rather than 1: no shared words is no evidence,
 * and the identity reading would cluster every content-free ticket together.
 */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  // Iterate the smaller set: the cost is the smaller size, not the sum.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const token of small) if (large.has(token)) shared += 1;

  return shared / (a.size + b.size - shared);
}

/**
 * Whether two tickets are plausibly about the same thing.
 *
 * Either enough overlap, or one substantive word in common. The second clause is
 * permissive on purpose and is not the safeguard — `minSize` is. A pair of
 * printer tickets sharing only "drucker" does not raise anything; three of them
 * inside the configured window do, which is the question the feature is asking.
 *
 * **Paraphrases are not detected.** "Outlook offline" and "E-Mail geht nicht"
 * share no vocabulary and will never group here. Catching that needs embeddings,
 * a vector store and a re-index job — see the note at the top of this file for
 * why that trade was refused. The limitation is real and stated rather than
 * papered over.
 */
export function related(a: Set<string>, b: Set<string>): boolean {
  if (similarity(a, b) >= CLUSTER_THRESHOLD) return true;

  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const token of small) {
    if (token.length >= DISTINCTIVE_TOKEN && large.has(token)) return true;
  }
  return false;
}

export interface ClusterInput {
  id: string;
  /** Title plus opening message. The caller decides how much of the body to pass. */
  text: string;
}

export interface TicketCluster {
  /** Member ids, in the order they were given. */
  ids: string[];
  /** The tokens every member shares — the topic, as far as arithmetic can tell. */
  keywords: string[];
}

/** Two tickets belong together above this overlap. Tuned in the suite, not here. */
export const CLUSTER_THRESHOLD = 0.2;

/**
 * A shared word this long is enough on its own.
 *
 * Jaccard alone is too strict for ticket titles, and the suite is where that
 * showed up. Three real reports of one outage —
 *
 *   "Outlook startet nicht mehr" · "Outlook geht nicht, startet einfach nicht" ·
 *   "Outlook lässt sich nicht mehr starten"
 *
 * — score 0.67, 0.25 and 0.20 against each other, because each writer picked a
 * different verb. On sets of two or three tokens every unshared word costs a
 * third of the score, so the measure punishes exactly the variation an outage
 * produces.
 *
 * `outlook`, `drucker`, `netzlaufwerk` are what those tickets actually have in
 * common, and a shared word of five characters or more is a topic rather than
 * grammar — the stopword list has already removed the words that are neither.
 * Short shared tokens still need the Jaccard score, so `vpn` alone does not
 * bind two otherwise unrelated tickets.
 */
const DISTINCTIVE_TOKEN = 5;

/** How many shared words the headline falls back to. */
const KEYWORD_LIMIT = 4;

/**
 * Group tickets by topic.
 *
 * Single-link agglomeration in one pass: each ticket joins the first existing
 * group it is similar *enough* to any member of, otherwise it starts its own.
 * Single-link rather than average-link because an outage grows by people
 * describing it differently — the fourth reporter matches the first one's wording,
 * not the group's centroid.
 *
 * The obvious risk of single-link is chaining, where A~B and B~C drags in a C that
 * has nothing to do with A. It is bounded here by the window the caller passes
 * (an hour of tickets, not a year) and by `keywords` being the *intersection*: a
 * chained group has no shared vocabulary left and reports none.
 *
 * O(n·m) over groups, with n capped by the caller. Fine for a queue; this is not
 * a clustering library.
 */
export function clusterTickets(
  items: ClusterInput[],
  options: { minSize: number },
): TicketCluster[] {
  const groups: { ids: string[]; sets: Set<string>[] }[] = [];

  for (const item of items) {
    const tokens = new Set(tokenize(item.text));
    if (tokens.size === 0) continue;

    const hit = groups.find((group) =>
      group.sets.some((member) => related(tokens, member)),
    );

    if (hit) {
      hit.ids.push(item.id);
      hit.sets.push(tokens);
    } else {
      groups.push({ ids: [item.id], sets: [tokens] });
    }
  }

  return groups
    .filter((group) => group.ids.length >= options.minSize)
    .map((group) => ({
      ids: group.ids,
      keywords: sharedKeywords(group.sets),
    }))
    // Biggest first: if two outages are running, the queue header should lead with
    // the one more people are reporting.
    .sort((a, b) => b.ids.length - a.ids.length);
}

/**
 * Words present in every member.
 *
 * The intersection rather than the most frequent tokens: a word two of five
 * members used is not what the group is about, and a headline built from it reads
 * confidently about the wrong thing. An empty result is honest — the caller then
 * shows a neutral title instead of a made-up one.
 */
function sharedKeywords(sets: Set<string>[]): string[] {
  if (sets.length === 0) return [];

  let common = [...sets[0]];
  for (const set of sets.slice(1)) {
    common = common.filter((token) => set.has(token));
    if (common.length === 0) break;
  }

  // Longest first: the specific word beats the generic one when both survive.
  return common.sort((a, b) => b.length - a.length).slice(0, KEYWORD_LIMIT);
}
