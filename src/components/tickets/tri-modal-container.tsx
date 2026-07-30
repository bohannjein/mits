"use client";

import {
  BotIcon,
  ListChecksIcon,
  PenLineIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SchemaForm } from "@/components/forms/schema-form";
import { AiChatTab } from "@/components/tickets/ai-chat-tab";
import { DraftReceipt } from "@/components/tickets/draft-receipt";
import { ServiceCatalog } from "@/components/tickets/service-catalog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QUICK_TICKET_SCHEMA, findSchema } from "@/lib/mock-schemas";
import { useIntakeStore } from "@/lib/store/intake-store";
import type { MITSTicketDraft, TicketSource } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The tri-modal intake.

   Three ways in, one draft shape out. Note that the "classic" tab is not a
   hand-written form: it renders QUICK_TICKET_SCHEMA through the same
   <SchemaForm> as the guided catalogue.
   ────────────────────────────────────────────────────────────────────────── */

const TABS: { value: TicketSource; label: string; icon: typeof PenLineIcon }[] = [
  { value: "legacy", label: "Schnell-Ticket", icon: PenLineIcon },
  { value: "wizard", label: "Service-Katalog", icon: ListChecksIcon },
  { value: "ai_chat", label: "KI-Assistent", icon: BotIcon },
];

export function TriModalContainer() {
  const router = useRouter();
  const mode = useIntakeStore((state) => state.mode);
  const setMode = useIntakeStore((state) => state.setMode);
  const lastDraft = useIntakeStore((state) => state.lastDraft);
  const acceptDraft = useIntakeStore((state) => state.acceptDraft);
  const dismissDraft = useIntakeStore((state) => state.dismissDraft);
  const [error, setError] = useState<string | null>(null);
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

    const response = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        payload: toJsonPayload(draft.payload),
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

    acceptDraft(draft);
    // The "my tickets" listing is server-rendered, so its cache must go.
    router.refresh();
  };

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => setMode(value as TicketSource)}
      className="gap-6"
    >
      <TabsList className="h-auto w-full flex-wrap rounded-sm border-2 border-border bg-card p-1">
        {TABS.map(({ value, label, icon: Icon }) => (
          <TabsTrigger key={value} value={value} className="h-9 rounded-sm">
            <Icon />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      {error && (
        <Alert variant="destructive" className="rounded-sm border-2">
          <TriangleAlertIcon />
          <AlertTitle>Nicht gespeichert</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {lastDraft ? (
        <DraftReceipt draft={lastDraft} onDismiss={dismissDraft} />
      ) : (
        <>
          <TabsContent value="legacy">
            <SchemaForm
              schema={QUICK_TICKET_SCHEMA}
              source="legacy"
              onSubmit={handleSubmit}
            />
          </TabsContent>

          <TabsContent value="wizard">
            <ServiceCatalog onSubmit={handleSubmit} />
          </TabsContent>

          <TabsContent value="ai_chat">
            {aiProposal ? (
              <AiProposalForm
                schemaId={aiProposal.schemaId}
                payload={aiProposal.payload}
                onSubmit={handleSubmit}
                onDiscard={() => setAiProposal(null)}
              />
            ) : (
              <AiChatTab
                onAccept={(schemaId, payload) =>
                  setAiProposal({ schemaId, payload })
                }
              />
            )}
          </TabsContent>
        </>
      )}
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
  schemaId,
  payload,
  onSubmit,
  onDiscard,
}: {
  schemaId: string;
  payload: Record<string, unknown>;
  onSubmit: (draft: MITSTicketDraft) => Promise<void>;
  onDiscard: () => void;
}) {
  const schema = findSchema(schemaId);

  if (!schema) {
    return (
      <Alert variant="destructive" className="rounded-sm border-2">
        <TriangleAlertIcon />
        <AlertTitle>Formular nicht gefunden</AlertTitle>
        <AlertDescription>
          Das Schema „{schemaId}“ ist MITS nicht bekannt.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-5">
      <Alert className="rounded-sm border-2">
        <SparklesIcon />
        <AlertTitle>Von der KI vorbefüllt: {schema.title}</AlertTitle>
        <AlertDescription>
          Bitte alle Felder prüfen und ergänzen. Abgesendet wird nur, was hier
          steht.
        </AlertDescription>
      </Alert>

      <SchemaForm
        key={schema.id}
        schema={schema}
        source="ai_chat"
        initialPayload={payload}
        onSubmit={onSubmit}
        secondaryAction={
          <Button
            type="button"
            variant="ghost"
            className="rounded-sm"
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
 * Replace `File` objects with the metadata that survives JSON.
 *
 * Blob storage is not part of this phase; recording name, size and type keeps the
 * ticket honest about what was attached instead of dropping it silently. The API
 * validates exactly this shape (`AttachmentMetaSchema`).
 */
function toJsonPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value) && value.every((entry) => entry instanceof File)) {
      out[key] = (value as File[]).map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
      }));
    } else {
      out[key] = value;
    }
  }

  return out;
}
