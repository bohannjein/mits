"use client";

import { BotIcon, ListChecksIcon, PenLineIcon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SchemaForm } from "@/components/forms/schema-form";
import { AiChat } from "@/components/tickets/ai-chat";
import { DraftReceipt } from "@/components/tickets/draft-receipt";
import { ServiceCatalog } from "@/components/tickets/service-catalog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QUICK_TICKET_SCHEMA } from "@/lib/mock-schemas";
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
            <AiChat />
          </TabsContent>
        </>
      )}
    </Tabs>
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
