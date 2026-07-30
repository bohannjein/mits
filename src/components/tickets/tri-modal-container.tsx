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
import { useIntakeStore } from "@/lib/store/intake-store";
import type { MITSFormSchema, MITSTicketDraft, TicketSource } from "@/types/mits";

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

export function TriModalContainer({
  /** Free-text fallback form. Rendered by the classic tab. */
  quickTicketSchema,
  /** Everything the guided catalogue offers. */
  catalogSchemas,
}: {
  quickTicketSchema: MITSFormSchema;
  catalogSchemas: MITSFormSchema[];
}) {
  const router = useRouter();
  // Both tabs' AI proposal and the wizard resolve ids against the same list.
  const allSchemas = [quickTicketSchema, ...catalogSchemas];
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
      body: JSON.stringify({ ...draft, payload }),
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
              schema={quickTicketSchema}
              source="legacy"
              onSubmit={handleSubmit}
            />
          </TabsContent>

          <TabsContent value="wizard">
            <ServiceCatalog schemas={catalogSchemas} onSubmit={handleSubmit} />
          </TabsContent>

          <TabsContent value="ai_chat">
            {aiProposal ? (
              <AiProposalForm
                schema={allSchemas.find(
                  (candidate) => candidate.id === aiProposal.schemaId,
                )}
                schemaId={aiProposal.schemaId}
                payload={aiProposal.payload}
                onSubmit={handleSubmit}
                onDiscard={() => setAiProposal(null)}
              />
            ) : (
              <AiChatTab
                schemas={allSchemas}
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
  schema,
  schemaId,
  payload,
  onSubmit,
  onDiscard,
}: {
  schema: MITSFormSchema | undefined;
  schemaId: string;
  payload: Record<string, unknown>;
  onSubmit: (draft: MITSTicketDraft) => Promise<void>;
  onDiscard: () => void;
}) {
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
