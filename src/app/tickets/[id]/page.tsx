import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, MapPinIcon } from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { AgentActions } from "@/components/tickets/agent-actions";
import { TicketThread } from "@/components/tickets/ticket-thread";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { canViewBoard } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { getFormSchema } from "@/lib/form-schemas";
import { resolveFields } from "@/lib/forms/schema-to-zod";
import { getLocation } from "@/lib/locations";
import { listCommentsFor } from "@/lib/ticket-comments";
import { getTicketFor } from "@/lib/tickets";
import { listUsers } from "@/lib/users";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatTicketNumber,
} from "@/types/mits";

export const metadata: Metadata = {
  title: "Ticket — MITS",
};

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/tickets/${id}`);

  // `getTicketFor` answers null both for "does not exist" and "not yours", so a
  // 404 here leaks nothing about which ids are real.
  const ticket = getTicketFor(id, user);
  if (!ticket) notFound();

  const isAgent = canViewBoard(user.role);
  const comments = listCommentsFor(id, user);
  const schema = ticket.form_schema_id
    ? getFormSchema(ticket.form_schema_id)
    : undefined;
  const location = ticket.location_id ? getLocation(ticket.location_id) : null;

  // Only staff may hold a ticket, so only staff appear in the picker.
  const agents = isAgent
    ? listUsers()
        .filter((candidate) => canViewBoard(candidate.role))
        .map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          email: candidate.email,
        }))
    : [];

  const assignee = ticket.assigned_to
    ? agents.find((agent) => agent.id === ticket.assigned_to)
    : undefined;

  // `resolveFields` is the same label resolution the renderer and the AI preview
  // use, so a field is named identically wherever it appears.
  const labels = new Map(
    schema ? resolveFields(schema).map((field) => [field.name, field.label]) : [],
  );

  const fields = Object.entries(ticket.payload)
    .map(([name, value]) => ({
      name,
      label: labels.get(name) ?? name,
      text: formatValue(value),
    }))
    .filter((row) => row.text !== "");

  return (
    <>
      <AppHeader />
      <main className="flex flex-1 flex-col items-center px-6 py-10">
        <div className="grid w-full max-w-4xl gap-8">
          <div>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-muted-foreground"
            >
              <Link href={isAgent ? "/board" : "/tickets"}>
                <ArrowLeftIcon strokeWidth={1.5} />
                {isAgent ? "Board" : "Meine Tickets"}
              </Link>
            </Button>

            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="font-mono text-sm text-muted-foreground">
                  {formatTicketNumber(ticket.ticket_number)}
                </span>
                <h1 className="mt-1 text-2xl font-normal tracking-tight sm:text-3xl">
                  {ticket.title}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Gemeldet von {ticket.created_by_email} am{" "}
                  {ticket.created_at.toLocaleString("de-DE", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="h-auto rounded-full px-3 py-1">
                  {TICKET_STATUS_LABELS[ticket.status]}
                </Badge>
                <Badge
                  variant={
                    ticket.priority === "urgent" || ticket.priority === "high"
                      ? "default"
                      : "outline"
                  }
                  className="h-auto rounded-full px-3 py-1"
                >
                  {TICKET_PRIORITY_LABELS[ticket.priority]}
                </Badge>
                {location && (
                  <Badge
                    variant="outline"
                    className="h-auto rounded-full px-3 py-1 font-normal"
                  >
                    <MapPinIcon className="size-3" strokeWidth={1.5} />
                    {location.name}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <Separator className="bg-border" />

          <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
            <CardHeader>
              <CardTitle className="text-lg font-medium">
                {schema?.title ?? "Angaben"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Keine strukturierten Angaben.
                </p>
              ) : (
                <dl className="grid gap-0 divide-y divide-border overflow-hidden rounded-2xl border border-border">
                  {fields.map((field) => (
                    <div
                      key={field.name}
                      className="grid gap-0.5 p-3 sm:grid-cols-[14rem_1fr]"
                    >
                      <dt className="text-xs font-medium text-muted-foreground">
                        {field.label}
                      </dt>
                      <dd className="text-sm break-words whitespace-pre-wrap">
                        {field.text}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              <p className="mt-4 text-xs text-muted-foreground">
                Bearbeitung:{" "}
                {assignee
                  ? assignee.name
                  : ticket.assigned_to
                    ? "zugewiesen"
                    : "noch nicht zugewiesen"}
              </p>
            </CardContent>
          </Card>

          {isAgent && (
            <AgentActions
              ticket={ticket}
              agents={agents}
              currentUserId={user.id}
            />
          )}

          <TicketThread
            ticketId={ticket.id}
            comments={comments}
            isAgent={isAgent}
          />
        </div>
      </main>
    </>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    return value
      .map((entry) =>
        entry && typeof entry === "object" && "name" in entry
          ? String((entry as { name: unknown }).name)
          : String(entry),
      )
      .join(", ");
  }
  if (typeof value === "object") return "";
  return String(value).trim();
}
