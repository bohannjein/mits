"use client";

import { ArrowLeftIcon, ChevronRightIcon } from "lucide-react";

import { SchemaForm } from "@/components/forms/schema-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { iconFor } from "@/lib/icons";
import { groupByCategory } from "@/lib/mock-schemas";
import { useIntakeStore } from "@/lib/store/intake-store";
import type { MITSFormSchema, MITSTicketDraft } from "@/types/mits";

/**
 * Guided intake: category tiles first, then the chosen schema in <SchemaForm>.
 * The tiles are generated from the schema list the server handed down, so
 * publishing a new ticket type — in code or in the builder — never touches this
 * file.
 */
export function ServiceCatalog({
  schemas,
  onSubmit,
}: {
  schemas: MITSFormSchema[];
  onSubmit: (draft: MITSTicketDraft) => void | Promise<void>;
}) {
  const selectedSchemaId = useIntakeStore((state) => state.selectedSchemaId);
  const selectSchema = useIntakeStore((state) => state.selectSchema);
  const selected = schemas.find((schema) => schema.id === selectedSchemaId);

  if (selected) {
    const Icon = iconFor(selected.icon);

    return (
      <div className="grid gap-6">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
          <div className="grid gap-1">
            <h2 className="text-xl font-bold uppercase">{selected.title}</h2>
            {selected.description && (
              <p className="text-sm text-muted-foreground">
                {selected.description}
              </p>
            )}
          </div>
          <Badge variant="outline" className="ml-auto rounded-sm font-mono">
            v{selected.version}
          </Badge>
        </div>

        <SchemaForm
          key={selected.id}
          schema={selected}
          source="wizard"
          onSubmit={onSubmit}
          secondaryAction={
            <Button
              type="button"
              variant="ghost"
              className="rounded-sm"
              onClick={() => selectSchema(null)}
            >
              <ArrowLeftIcon />
              Katalog
            </Button>
          }
        />
      </div>
    );
  }

  if (schemas.length === 0) {
    return (
      <p className="rounded-sm border-2 border-border p-6 text-sm text-muted-foreground">
        Es ist noch kein Formular veröffentlicht. Die Administration kann im
        Formular-Builder eines anlegen.
      </p>
    );
  }

  return (
    <div className="grid gap-8">
      {groupByCategory(schemas).map(({ category, schemas: grouped }) => (
        <section key={category} className="grid gap-3">
          <h2 className="label-industrial">{category}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {grouped.map((schema) => {
              const Icon = iconFor(schema.icon);
              return (
                <Card
                  key={schema.id}
                  className="rounded-sm border-2 border-border shadow-brutal ring-0 transition-shadow hover:shadow-brutal-primary"
                >
                  <CardHeader>
                    <Icon className="size-6 text-primary" aria-hidden />
                    <CardTitle className="mt-3 uppercase">
                      {schema.title}
                    </CardTitle>
                    {schema.description && (
                      <CardDescription>{schema.description}</CardDescription>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 w-fit rounded-sm"
                      onClick={() => selectSchema(schema.id)}
                    >
                      Formular öffnen
                      <ChevronRightIcon />
                    </Button>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
