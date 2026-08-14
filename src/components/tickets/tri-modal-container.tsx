"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  BotIcon,
  ListChecksIcon,
  PenLineIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { z } from "zod";

import { SchemaForm } from "@/components/forms/schema-form";
import { AiChatTab } from "@/components/tickets/ai-chat-tab";
import { ChatIntake } from "@/components/tickets/chat-intake";
import { TicketReceipt } from "@/components/tickets/draft-receipt";
import { IntentTiles } from "@/components/tickets/intent-tiles";
import { LocationPicker } from "@/components/tickets/location-picker";
import { ProcessSuggestions } from "@/components/tickets/process-suggestions";
import { ServiceCatalog } from "@/components/tickets/service-catalog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CarryText } from "@/lib/forms/carry-over";
import {
  DEFLECTION_LIMIT,
  suggestFaqs,
  type DeflectionHit,
} from "@/lib/services/ai/deflection";
import { hasFormSuggestions, triage } from "@/lib/services/auto-triage";
import { useIntakeStore } from "@/lib/store/intake-store";
import { cn } from "@/lib/utils";
import {
  MITSTicketSchema,
  type IntakeCategory,
  type MITSCategoryNode,
  type MITSFormSchema,
  type MITSLocation,
  type MITSTicket,
  type MITSTicketDraft,
  type PortalFaq,
  type TicketSource,
  type TriageRule,
} from "@/types/mits";
import {
  FormOptionsProvider,
  type FormFieldOptions,
} from "@/lib/forms/registry";

const TicketResponseSchema = z.object({ ticket: MITSTicketSchema });

/* ──────────────────────────────────────────────────────────────────────────
   The tri-modal intake.

   Three ways in, one draft shape out. Note that the "classic" tab is not a
   hand-written form: it renders QUICK_TICKET_SCHEMA through the same
   <SchemaForm> as the guided catalogue.
   ────────────────────────────────────────────────────────────────────────── */

const TABS: {
  value: TicketSource;
  label: string;
  icon: typeof PenLineIcon;
  /** The AI tab keeps the Gemini gradient identity of the portal tile. */
  gemini?: boolean;
}[] = [
  { value: "legacy", label: "Schnellerstellung", icon: PenLineIcon },
  { value: "wizard", label: "Service-Katalog", icon: ListChecksIcon },
  { value: "ai_chat", label: "KI-Assistent", icon: BotIcon, gemini: true },
];

/**
 * Springs, not durations. The pill is stiff and near-critically damped so it
 * tracks the pointer without a visible bounce; the panel is softer because it
 * travels further.
 */
const PILL = { type: "spring", stiffness: 460, damping: 36, mass: 0.7 } as const;
const PANEL = { type: "spring", stiffness: 240, damping: 26, mass: 0.9 } as const;

/**
 * Mount animation for a tab panel. Radix unmounts the inactive panels, so the
 * mount is the transition — no AnimatePresence needed, and none possible
 * without replacing the Radix Tabs primitive.
 */
function TabPanel({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={PANEL}
    >
      {children}
    </motion.div>
  );
}

export function TriModalContainer({
  /** Free-text fallback form. Rendered by the classic tab. */
  quickTicketSchema,
  /** Everything the guided catalogue offers. */
  catalogSchemas,
  /** Tab to open, from `?mode=` — the portal tiles deep-link into a mode. */
  initialMode,
  /** Selectable sites. Empty hides the picker entirely. */
  locations = [],
  /**
   * Live choices for the `location` and `user` field widgets, loaded server-side.
   * Separate from `locations` above, which drives the ticket's own site column —
   * these fill schema fields and are labels, not foreign keys.
   */
  fieldOptions = { locations: [], users: [] },
  /** First name for the composer's greeting. Empty renders the neutral wording. */
  greetingName = "",
  /** FAQ entries for the self-service hints. Empty switches the area off. */
  faqs = [],
  /** The category tree, for the intent tiles. Empty hides them entirely. */
  categories = [],
  /**
   * Keyword rules, behind the FAQ hints *and* the form suggestions beside the
   * free-text field.
   *
   * Sent whole to the browser like the FAQ beside it, and for the same reason: the
   * matching runs on every pause in typing, so a request per keystroke-burst is
   * not an option. They contain no secrets — a keyword, a category name and a form
   * title are all things the reporter is about to be shown anyway.
   */
  triageRules = [],
  /**
   * Ob der KI-Reiter angeboten wird.
   *
   * Serverseitig entschieden (`intake_ai` unter /admin/settings/roles), weil die
   * beiden anderen Reiter an einem Formular hängen und dieser an nichts — er
   * bräuchte sonst als einziger keinen Schalter, und „warum lässt sich der Chat
   * nicht abschalten" wäre eine berechtigte Frage.
   */
  aiChat = true,
}: {
  /** Fehlt, wenn diese Rolle das Freitext-Formular nicht sieht. Dann ohne den Reiter. */
  quickTicketSchema?: MITSFormSchema;
  catalogSchemas: MITSFormSchema[];
  initialMode?: TicketSource;
  locations?: MITSLocation[];
  fieldOptions?: FormFieldOptions;
  greetingName?: string;
  faqs?: PortalFaq[];
  categories?: MITSCategoryNode[];
  triageRules?: TriageRule[];
  aiChat?: boolean;
}) {
  const router = useRouter();
  // Both tabs' AI proposal and the wizard resolve ids against the same list.
  const allSchemas = quickTicketSchema
    ? [quickTicketSchema, ...catalogSchemas]
    : catalogSchemas;
  const storeMode = useIntakeStore((state) => state.mode);
  const setMode = useIntakeStore((state) => state.setMode);

  /*
   * `initialMode` cannot simply be written into the store: this component also
   * renders on the server, where the store is a module-level singleton shared
   * across requests — one visitor's `?mode=` would leak into another's render.
   *
   * So the prop wins for the first paint and an effect hands control to the
   * store afterwards. Server and client agree on that first render, so there is
   * no hydration mismatch and no visible flash of the default tab.
   */
  const [storeOwnsMode, setStoreOwnsMode] = useState(!initialMode);
  useEffect(() => {
    if (!initialMode) return;
    setMode(initialMode);
    setStoreOwnsMode(true);
  }, [initialMode, setMode]);

  /*
   * Welche der drei Reiter es hier überhaupt gibt.
   *
   * Zwei hängen an einem Formular und verschwinden mit ihm — ein „Service-Katalog"
   * über einer leeren Liste ist ein Reiter, der aussieht, als sei etwas kaputt.
   * Der Dritte hat kein Formular hinter sich und deshalb einen eigenen Schalter.
   */
  const tabs = TABS.filter(({ value }) => {
    if (value === "legacy") return Boolean(quickTicketSchema);
    if (value === "wizard") return catalogSchemas.length > 0;
    return aiChat;
  });

  /*
   * Der gemerkte oder verlinkte Reiter, sofern es ihn hier gibt.
   *
   * Der Modus überlebt im Store und in `?mode=`, die Sichtbarkeit kann sich
   * dazwischen geändert haben — ohne diesen Rückfall stünde jemand mit einem
   * gemerkten „ai_chat" vor einem Reiterstreifen ohne ausgewählten Reiter und
   * einer leeren Fläche darunter.
   */
  const wanted = storeOwnsMode ? storeMode : initialMode!;
  const mode = tabs.some((tab) => tab.value === wanted)
    ? wanted
    : tabs[0]?.value;
  const dismissDraft = useIntakeStore((state) => state.dismissDraft);
  const openSchema = useIntakeStore((state) => state.openSchema);
  const [error, setError] = useState<string | null>(null);
  /** The persisted ticket, shown as a confirmation instead of the old JSON dump. */
  const [created, setCreated] = useState<MITSTicket | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  /**
   * The intent answer, and which tile group is open.
   *
   * Both here rather than inside `IntentTiles`, because this component re-renders
   * the tiles on every tab switch and on every keystroke that changes `error` —
   * state living in the child would fold the second step back up mid-choice.
   */
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [openIntent, setOpenIntent] = useState<string | null>(null);
  /** Accepted AI proposal: which form to open and with which values. */
  const [aiProposal, setAiProposal] = useState<{
    schemaId: string;
    payload: Record<string, unknown>;
  } | null>(null);

  /*
   * The free-text composer's four answers, held here rather than in `ChatIntake`.
   *
   * Radix unmounts the inactive tab panel, so state inside that component died on
   * every tab switch — and a form suggestion beside the field switches tabs on
   * purpose, which would have made it destroy the very text it matched against.
   * The suggestion column also needs the same words, and it is a sibling of the
   * card: what two siblings share cannot live in either.
   *
   * Not in `useIntakeStore` — the store is a module singleton and shared across
   * requests on the server, so somebody's half-written sentence would surface in
   * another visitor's first render. Same reason `initialMode` is a prop.
   */
  const [freeTitle, setFreeTitle] = useState("");
  const [freeDescription, setFreeDescription] = useState("");
  const [freeCategory, setFreeCategory] = useState<IntakeCategory | null>(null);
  const [freeFiles, setFreeFiles] = useState<File[]>([]);

  /**
   * What the person wrote in the AI tab, reported by `AiChatTab` on a pause.
   *
   * Its own state and not the four above: that tab has one text box, no title and
   * no category, and its images go to the vision model rather than into the file
   * store. Merging the two would mean deciding which half of a free-text ticket a
   * chat prompt is.
   */
  const [aiText, setAiText] = useState("");

  /** Matched articles and forms, plus the two "leave me alone" switches. */
  const [faqHits, setFaqHits] = useState<DeflectionHit[]>([]);
  const [formHits, setFormHits] = useState<MITSFormSchema[]>([]);
  const [dismissedHints, setDismissedHints] = useState(false);
  const [dismissedForms, setDismissedForms] = useState(false);

  /**
   * The text a taken suggestion carries into the catalogue form.
   *
   * A snapshot rather than a read of the four values above: it is answered at the
   * moment of the click, and the composer keeps its text afterwards so „zurück zum
   * Katalog" and a tab switch back both find it where it was.
   */
  const [carry, setCarry] = useState<CarryText | null>(null);

  /*
   * Whether a second column exists at all — same expression the page uses to pick
   * its width, hence the shared helper. Without the gate the grid would squeeze the
   * composer into two thirds of a page that never widened.
   */
  const railPossible = hasFormSuggestions(
    triageRules,
    catalogSchemas.map((schema) => schema.id),
  );

  /** The words the rules see, from whichever tab is doing the writing. */
  const matchText =
    mode === "ai_chat" ? aiText : `${freeTitle} ${freeDescription}`;

  /*
   * Both suggestion lists, recomputed after a pause in typing.
   *
   * The matching is a set intersection over a few dozen entries, so debouncing is
   * not about cost — it is about not shuffling links and cards underneath somebody
   * mid-sentence. 500 ms is long enough that the area only changes when they stop
   * to think.
   *
   * Held in state rather than derived during render for exactly that reason:
   * deriving would update on every keystroke and undo the debounce.
   */
  useEffect(() => {
    // The FAQ hints live inside the free-text card; the rail stands beside both
    // text-carrying tabs. Neither wants to be matched against the other's words.
    const wantsFaq = mode === "legacy" && faqs.length > 0 && !dismissedHints;
    const wantsForms =
      railPossible &&
      !dismissedForms &&
      (mode === "legacy" || mode === "ai_chat");
    if (!wantsFaq && !wantsForms) return;

    const timer = window.setTimeout(() => {
      const outcome = triage(matchText, triageRules);

      if (wantsFaq) {
        /*
         * Keyword rules first, then the lexical match — and the order is the point.
         *
         * A rule is an admin saying „diese Artikel gehören zu diesem Wort", which
         * is a stronger statement than a token overlap of 0.4. So the rules'
         * articles head the list, and the lexical hits fill whatever room is left
         * up to `DEFLECTION_LIMIT`.
         *
         * Deduplicated on the id: an article can be both named by a rule and found
         * by the overlap, and the same question twice reads as a rendering bug.
         */
        const byKeyword = outcome.faqIds
          .map((id) => faqs.find((faq) => faq.id === id))
          .filter((faq): faq is PortalFaq => faq !== undefined)
          // Score 1: it was named, not measured. Nothing reads it here, but the
          // shape has to match, and inventing a fraction would be a made-up number.
          .map((faq) => ({ id: faq.id, question: faq.question, score: 1 }));

        const lexical = suggestFaqs(matchText, faqs).filter(
          (hit) => !byKeyword.some((named) => named.id === hit.id),
        );

        setFaqHits([...byKeyword, ...lexical].slice(0, DEFLECTION_LIMIT));
      }

      if (wantsForms) {
        // Resolved against what this role may actually see. An id the catalogue
        // does not carry falls out silently — a suggestion nobody can open is
        // worse than one fewer suggestion.
        setFormHits(
          outcome.formSchemaIds
            .map((id) => catalogSchemas.find((schema) => schema.id === id))
            .filter((schema): schema is MITSFormSchema => schema !== undefined),
        );
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    matchText,
    mode,
    faqs,
    triageRules,
    catalogSchemas,
    railPossible,
    dismissedHints,
    dismissedForms,
  ]);

  /**
   * Take a suggestion: snapshot the text, then open that form.
   *
   * `openSchema` is one store write on purpose — `setMode` clears the selected
   * schema, so mode and selection set separately would land on the tile grid.
   *
   * From the AI tab the whole prompt is the description and there is no title: that
   * tab has one box, and splitting its first sentence off as a heading would be an
   * invention. Its images stay behind — they were uploaded to the vision model, not
   * to the file store.
   */
  const takeSuggestion = (schemaId: string) => {
    setCarry(
      mode === "ai_chat"
        ? { title: "", description: aiText, files: [] }
        : { title: freeTitle, description: freeDescription, files: freeFiles },
    );
    openSchema(schemaId);
  };

  /**
   * Persist the draft. The owner is not sent — the API takes it from the session,
   * so a forged `created_by` in the body would be ignored.
   */
  const handleSubmit = async (draft: MITSTicketDraft) => {
    setError(null);

    // Attachments go to disk first; the payload then references them by id.
    let payload: Record<string, unknown>;
    try {
      payload = await uploadAttachments(draft.payload);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Ein Anhang konnte nicht hochgeladen werden.",
      );
      return;
    }

    const response = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      /*
       * The site and the category are written here, over whatever the mode sent.
       *
       * Both are chosen once above the tab strip, so the three forms pass null and
       * this is the single place that knows the answer — threading `categoryId`
       * through `ServiceCatalog` into `SchemaForm` would be four props for a value
       * none of them owns.
       *
       * The server does not trust it either way: `createTicket` checks the id
       * against the category table and drops an unknown one rather than storing a
       * reference no filter resolves.
       */
      body: JSON.stringify({
        ...draft,
        payload,
        location_id: locationId,
        category_id: categoryId,
      }),
    });

    if (response.status === 401) {
      router.push("/login?next=/tickets/new");
      return;
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      setError(body?.error ?? `Ticket konnte nicht gespeichert werden (HTTP ${response.status}).`);
      return;
    }

    // Parsed, not cast: the API answers with ISO strings and the schema coerces
    // `created_at` to a Date, so the receipt gets the same shape a page render has.
    const body = (await response.json()) as unknown;
    const parsed = TicketResponseSchema.safeParse(body);
    if (!parsed.success) {
      setError(
        "Das Ticket wurde gespeichert, die Antwort war aber unlesbar. Bitte unter „Meine Tickets“ nachsehen.",
      );
      return;
    }

    setCreated(parsed.data.ticket);
    // The "my tickets" listing is server-rendered, so its cache must go.
    router.refresh();
  };

  if (created) {
    return (
      <TicketReceipt
        ticket={created}
        schema={allSchemas.find(
          (candidate) => candidate.id === created.form_schema_id,
        )}
        onAnother={() => {
          setCreated(null);
          setAiProposal(null);
          dismissDraft();
          // The next ticket starts empty. Carrying the sent text into it would
          // offer a second copy of something already filed.
          setFreeTitle("");
          setFreeDescription("");
          setFreeCategory(null);
          setFreeFiles([]);
          setAiText("");
          setCarry(null);
          setFormHits([]);
          setFaqHits([]);
        }}
      />
    );
  }

  /*
   * Kein Reiter übrig.
   *
   * Die Seite leitet in diesem Fall bereits um; das hier ist die zweite Hälfte
   * derselben Regel, für den Fall, dass diese Komponente irgendwann woanders
   * gerendert wird. Eine Meldung und keine leere Fläche: „hier steht nichts" ist
   * von „hier ist etwas kaputt" sonst nicht zu unterscheiden.
   */
  if (!mode) {
    return (
      <Alert className="rounded-2xl border-border px-4 py-3 shadow-elev-1">
        <TriangleAlertIcon strokeWidth={1.5} />
        <AlertTitle>Kein Eingang freigeschaltet</AlertTitle>
        <AlertDescription>
          Für diese Rolle ist kein Ticketformular freigegeben. Die IT-Abteilung
          kann das unter „Sichtbarkeit“ ändern.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    /*
     * Two columns, and the first one keeps the width the page always had.
     *
     * The page caps itself at 70rem when a rail is possible, so at `xl` the `1fr`
     * beside a 20rem column and a 2rem gap resolves to exactly the 48rem the
     * composer has always had. `1fr` rather than `minmax(0,48rem)`: a track with a
     * fixed maximum overflows instead of shrinking, and the sum would break out of
     * the page on the first viewport too narrow for it.
     *
     * **Two column widths, and that is what makes `lg` bearable.** At 1024px there
     * are about 61rem to divide, so the composer *does* give up room — 16rem
     * instead of 20rem for the rail is the difference between a 43rem and a 39rem
     * composer. The cards hold a title and two lines either way.
     *
     * The column is *reserved* rather than conditional — one that springs into
     * existence on the first keyword would shove the composer sideways
     * mid-sentence, which costs more than empty space does. Without a rule that
     * names a process the page stays single-column and nothing here applies.
     */
    <div
      className={cn(
        railPossible &&
          "lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]",
      )}
    >
    <Tabs
      value={mode}
      onValueChange={(value) => setMode(value as TicketSource)}
      className="gap-6"
    >
      <TabsList className="h-auto w-full flex-wrap gap-1 rounded-full border border-border bg-card p-1.5">
        {tabs.map(({ value, label, icon: Icon, gemini }) => (
          <TabsTrigger
            key={value}
            value={value}
            className={cn(
              "relative h-10 rounded-full px-4 font-medium",
              // Neutralise the primitive's own active surface: the moving
              // pill below is what fills the active tab.
              "data-active:bg-transparent data-active:shadow-none dark:data-active:border-transparent dark:data-active:bg-transparent",
              "group-data-[variant=default]/tabs-list:data-active:shadow-none",
              "data-active:text-inverse-surface-foreground dark:data-active:text-inverse-surface-foreground",
            )}
          >
            {/* One shared layoutId across all three triggers: framer-motion
                interpolates position and width, so the pill slides instead of
                cutting between tabs. */}
            {mode === value && (
              <motion.span
                aria-hidden
                layoutId="intake-tab-pill"
                transition={PILL}
                className={cn(
                  "absolute inset-0 rounded-full bg-inverse-surface",
                  gemini && "shadow-glow-gemini",
                )}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              <Icon strokeWidth={1.5} />
              {label}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      {error && (
        <Alert
          variant="destructive"
          className="rounded-2xl border-border px-4 py-3 shadow-elev-1"
        >
          <TriangleAlertIcon strokeWidth={1.5} />
          <AlertTitle>Nicht gespeichert</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <LocationPicker
        locations={locations}
        value={locationId}
        onChange={setLocationId}
      />

      {/*
        Above the tabs, beside the site picker, and for the same reason: the
        question „worum geht es" is about the ticket, not about which of three
        forms somebody fills in. Held here so switching tabs mid-thought does not
        throw the answer away — and so all three modes stamp the same category.

        Renders nothing when no categories exist, which is how an instance that
        never adopted them sees no change at all.
      */}
      <IntentTiles
        categories={categories}
        value={categoryId}
        onChange={setCategoryId}
        openRoot={openIntent}
        onOpenRoot={setOpenIntent}
      />

      {/* One provider for all three tabs. The catalogue and the AI proposal render
          their own <SchemaForm> further down the tree and pick the choices up from
          here, so no intake path can end up with an empty picker by omission. */}
      <FormOptionsProvider options={fieldOptions}>
          {quickTicketSchema && (
          <TabsContent value="legacy">
            <TabPanel>
              {/*
                The composer, not `SchemaForm`, even though both fill the same
                schema. This is the path somebody takes when they do not know which
                form they need, and rendering the quick ticket as a labelled stack
                of controls made the easiest case look like the hardest one. The
                catalogue tab is one click away for anybody who wants the fields.
              */}
              <ChatIntake
                schemaId={quickTicketSchema.id}
                onSubmit={handleSubmit}
                greetingName={greetingName}
                title={freeTitle}
                description={freeDescription}
                category={freeCategory}
                files={freeFiles}
                onTitleChange={setFreeTitle}
                onDescriptionChange={setFreeDescription}
                onCategoryChange={setFreeCategory}
                onFilesChange={setFreeFiles}
                // Matched above, in the same debounce as the form suggestions —
                // both answer the same question about the same words.
                faqHits={faqHits}
                onDismissHints={() => {
                  setDismissedHints(true);
                  setFaqHits([]);
                }}
              />
            </TabPanel>
          </TabsContent>
          )}

          <TabsContent value="wizard">
            <TabPanel>
              <ServiceCatalog
                schemas={catalogSchemas}
                onSubmit={handleSubmit}
                locationId={locationId}
                // Only set when somebody arrived here from a suggestion. Browsing
                // the tiles by hand must not silently prefill a form from text
                // typed in another tab.
                carryText={carry}
                onClearCarry={() => setCarry(null)}
              />
            </TabPanel>
          </TabsContent>

          <TabsContent value="ai_chat">
            <TabPanel>
              {aiProposal ? (
                <AiProposalForm
                  schema={allSchemas.find(
                    (candidate) => candidate.id === aiProposal.schemaId,
                  )}
                  schemaId={aiProposal.schemaId}
                  payload={aiProposal.payload}
                  onSubmit={handleSubmit}
                  onDiscard={() => setAiProposal(null)}
                  locationId={locationId}
                />
              ) : (
                <AiChatTab
                  schemas={allSchemas}
                  onAccept={(schemaId, payload) =>
                    setAiProposal({ schemaId, payload })
                  }
                  // The setter itself, so the effect over there does not re-arm on
                  // every render of this component.
                  onMatchTextChange={setAiText}
                />
              )}
            </TabPanel>
          </TabsContent>
      </FormOptionsProvider>
    </Tabs>

      {/*
        The second column, over both tabs where somebody writes.

        Not over the catalogue: that tab *is* the same list in full, so suggesting
        three of its entries beside it would be a shortcut into where the person
        already stands. The AI tab does get it — the model's proposal and a keyword
        rule are two different claims, one guessed and one written down by an admin,
        and the rule is also there while the model is still thinking.

        Under `lg` there is no column and this drops into the normal flow below the
        composer.
      */}
      {railPossible && (mode === "legacy" || mode === "ai_chat") && (
        <div className="mt-6 lg:mt-0">
          <ProcessSuggestions
            schemas={formHits}
            onOpen={takeSuggestion}
            onDismiss={() => {
              setDismissedForms(true);
              setFormHits([]);
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The AI proposal opened in the real form.
 *
 * Nothing is submitted on the user's behalf: the extracted values are the form's
 * initial state, and the same validation and API path apply as for a hand-filled
 * ticket. `source: "ai_chat"` records how it got here.
 */
function AiProposalForm({
  schema,
  schemaId,
  payload,
  onSubmit,
  onDiscard,
  locationId,
}: {
  schema: MITSFormSchema | undefined;
  schemaId: string;
  payload: Record<string, unknown>;
  onSubmit: (draft: MITSTicketDraft) => Promise<void>;
  onDiscard: () => void;
  locationId: string | null;
}) {
  if (!schema) {
    return (
      <Alert
        variant="destructive"
        className="rounded-2xl border-border px-4 py-3 shadow-elev-1"
      >
        <TriangleAlertIcon strokeWidth={1.5} />
        <AlertTitle>Formular nicht gefunden</AlertTitle>
        <AlertDescription>
          Das Schema „{schemaId}“ ist MITS nicht bekannt.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-5">
      {/* Same Gemini treatment as the portal tile, so it stays obvious which
          part of the screen the model touched. */}
      <div className="relative">
        <span
          aria-hidden
          className="bg-gemini-sheen pointer-events-none absolute -inset-0.5 rounded-2xl opacity-60 blur-md"
        />
        <Alert className="relative rounded-2xl border-border px-4 py-3">
          <SparklesIcon strokeWidth={1.5} />
          <AlertTitle>Von der KI vorbefüllt: {schema.title}</AlertTitle>
          <AlertDescription>
            Bitte alle Felder prüfen und ergänzen. Abgesendet wird nur, was hier
            steht.
          </AlertDescription>
        </Alert>
      </div>

      <SchemaForm
        key={schema.id}
        schema={schema}
        source="ai_chat"
        initialPayload={payload}
        onSubmit={onSubmit}
        locationId={locationId}
        secondaryAction={
          <Button
            type="button"
            variant="ghost"
            className="rounded-full px-4"
            onClick={onDiscard}
          >
            Zurück zum Chat
          </Button>
        }
      />
    </div>
  );
}

/**
 * Upload every `File` in the payload and replace it with its stored reference.
 *
 * Uploading at submit time rather than on file selection keeps the form simple and
 * means an abandoned form leaves nothing on disk. `File` objects cannot survive
 * JSON anyway, so this conversion has to happen somewhere.
 */
async function uploadAttachments(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    const isFileList =
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((entry) => entry instanceof File);

    if (!isFileList) {
      // An empty array is still an empty attachment list, not a file list.
      out[key] = Array.isArray(value) && value.length === 0 ? [] : value;
      continue;
    }

    const form = new FormData();
    for (const file of value as File[]) form.append("files", file);

    const response = await fetch("/api/tickets/upload", {
      method: "POST",
      body: form,
    });

    const body = (await response.json().catch(() => null)) as
      | { uploads?: { id: string; name: string; size: number; type: string; url: string }[]; error?: string }
      | null;

    if (!response.ok || !body?.uploads) {
      throw new Error(
        body?.error ?? `Upload fehlgeschlagen (HTTP ${response.status}).`,
      );
    }

    out[key] = body.uploads.map((upload) => ({
      name: upload.name,
      size: upload.size,
      type: upload.type,
      fileId: upload.id,
      url: upload.url,
    }));
  }

  return out;
}
