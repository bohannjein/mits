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
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-elevated text-muted-foreground">
            <Icon className="size-5" strokeWidth={1.5} aria-hidden />
          </span>
          <div className="grid gap-1">
            <h2 className="text-xl font-medium tracking-tight">
              {selected.title}
            </h2>
            {selected.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {selected.description}
              </p>
            )}
          </div>
          <Badge variant="outline" className="ml-auto rounded-full">
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
              className="h-11 rounded-full px-4"
              onClick={() => selectSchema(null)}
            >
              <ArrowLeftIcon strokeWidth={1.5} />
              Katalog
            </Button>
          }
        />
      </div>
    );
  }

  if (schemas.length === 0) {
    return (
      <p className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">
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
                  className="group rounded-3xl border border-border bg-card ring-0 shadow-elev-1 transition-[box-shadow,border-color] duration-300 hover:border-foreground/20 hover:shadow-elev-3"
                >
                  <CardHeader>
                    <span className="grid size-11 place-items-center rounded-full bg-surface-elevated text-muted-foreground transition-colors duration-300 group-hover:text-foreground">
                      <Icon className="size-5" strokeWidth={1.5} aria-hidden />
                    </span>
                    <CardTitle className="mt-4 font-medium">
                      {schema.title}
                    </CardTitle>
                    {schema.description && (
                      <CardDescription className="mt-1 leading-relaxed">
                        {schema.description}
                      </CardDescription>
                    )}
                    <Button
                      type="button"
                      className="mt-5 w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
                      onClick={() => selectSchema(schema.id)}
                    >
                      Formular öffnen
                      <ChevronRightIcon strokeWidth={1.5} />
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
