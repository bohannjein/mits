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
import { TicketReceipt } from "@/components/tickets/draft-receipt";
import { LocationPicker } from "@/components/tickets/location-picker";
import { ServiceCatalog } from "@/components/tickets/service-catalog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIntakeStore } from "@/lib/store/intake-store";
import { cn } from "@/lib/utils";
import {
  MITSTicketSchema,
  type MITSFormSchema,
  type MITSLocation,
  type MITSTicket,
  type MITSTicketDraft,
  type TicketSource,
} from "@/types/mits";

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
  { value: "legacy", label: "Schnell-Ticket", icon: PenLineIcon },
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
}: {
  quickTicketSchema: MITSFormSchema;
  catalogSchemas: MITSFormSchema[];
  initialMode?: TicketSource;
  locations?: MITSLocation[];
}) {
  const router = useRouter();
  // Both tabs' AI proposal and the wizard resolve ids against the same list.
  const allSchemas = [quickTicketSchema, ...catalogSchemas];
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

  const mode = storeOwnsMode ? storeMode : initialMode!;
  const dismissDraft = useIntakeStore((state) => state.dismissDraft);
  const [error, setError] = useState<string | null>(null);
  /** The persisted ticket, shown as a confirmation instead of the old JSON dump. */
  const [created, setCreated] = useState<MITSTicket | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  /** Accepted AI proposal: which form to open and with which values. */
  const [aiProposal, setAiProposal] = useState<{
    schemaId: string;
    payload: Record<string, unknown>;
  } | null>(null);

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
      body: JSON.stringify({ ...draft, payload, location_id: locationId }),
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
        }}
      />
    );
  }

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => setMode(value as TicketSource)}
      className="gap-6"
    >
      <TabsList className="h-auto w-full flex-wrap gap-1 rounded-full border border-border bg-card p-1.5">
        {TABS.map(({ value, label, icon: Icon, gemini }) => (
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

      <>
          <TabsContent value="legacy">
            <TabPanel>
              <SchemaForm
                schema={quickTicketSchema}
                source="legacy"
                onSubmit={handleSubmit}
                locationId={locationId}
              />
            </TabPanel>
          </TabsContent>

          <TabsContent value="wizard">
            <TabPanel>
              <ServiceCatalog
                schemas={catalogSchemas}
                onSubmit={handleSubmit}
                locationId={locationId}
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
                />
              )}
            </TabPanel>
          </TabsContent>
      </>
    </Tabs>
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
