"use client";

import { BotIcon, ListChecksIcon, PenLineIcon } from "lucide-react";

import { SchemaForm } from "@/components/forms/schema-form";
import { AiChat } from "@/components/tickets/ai-chat";
import { DraftReceipt } from "@/components/tickets/draft-receipt";
import { ServiceCatalog } from "@/components/tickets/service-catalog";
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
  const mode = useIntakeStore((state) => state.mode);
  const setMode = useIntakeStore((state) => state.setMode);
  const lastDraft = useIntakeStore((state) => state.lastDraft);
  const acceptDraft = useIntakeStore((state) => state.acceptDraft);
  const dismissDraft = useIntakeStore((state) => state.dismissDraft);

  const handleSubmit = (draft: MITSTicketDraft) => acceptDraft(draft);

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
