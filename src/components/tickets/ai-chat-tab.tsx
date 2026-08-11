"use client";

import {
  ImagePlusIcon,
  Loader2Icon,
  ScanTextIcon,
  SendIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  fileToBase64,
  requestTriage,
  type TriageResult,
} from "@/lib/ai/extract";
import { pickSchemaFields, resolveFields } from "@/lib/forms/schema-to-zod";
import { cn } from "@/lib/utils";
import type { MITSFormSchema } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Free-text and screenshot intake.

   Nothing here is auto-submitted. The model's proposal is shown as a proposal,
   the user opens it in the real form, corrects it and sends it — so a confidently
   wrong extraction costs a glance, not a bad ticket.
   ────────────────────────────────────────────────────────────────────────── */

interface Attachment {
  file: File;
  previewUrl: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  images?: string[];
}

export function AiChatTab({
  schemas,
  onAccept,
}: {
  /** The schemas in effect, so the preview can resolve what the router picked. */
  schemas: MITSFormSchema[];
  /** Hand the vetted proposal to the container, which opens it in <SchemaForm>. */
  onAccept: (schemaId: string, payload: Record<string, unknown>) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageCounter = useRef(0);
  /**
   * Every object URL handed out, so unmount can release them all. Sent
   * attachments stay alive on purpose — their thumbnails remain on screen in the
   * message thread after the composer has been cleared.
   */
  const objectUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const nextId = () => {
    messageCounter.current += 1;
    return `msg-${messageCounter.current}`;
  };

  const addFiles = (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length !== files.length) {
      setError("Nur Bilddateien werden analysiert — andere Anhänge kommen in Phase 4.");
    }
    const added = images.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrls.current.add(previewUrl);
      return { file, previewUrl };
    });
    if (added.length > 0) setAttachments((current) => [...current, ...added]);
  };

  const dropAttachment = (index: number) => {
    setAttachments((current) => {
      const target = current[index];
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        objectUrls.current.delete(target.previewUrl);
      }
      return current.filter((_, i) => i !== index);
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const canSend = (input.trim().length > 0 || attachments.length > 0) && !pending;

  const send = async () => {
    if (!canSend) return;

    const prompt = input.trim();
    const previews = attachments.map((attachment) => attachment.previewUrl);
    const files = attachments.map((attachment) => attachment.file);

    setMessages((current) => [
      ...current,
      { id: nextId(), role: "user", text: prompt, images: previews },
    ]);
    setInput("");
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError(null);
    setResult(null);
    setPending(true);

    try {
      const images = await Promise.all(files.map(fileToBase64));
      const outcome = await requestTriage({ prompt, images });

      if (outcome.status === "unauthenticated") {
        setError("Die Sitzung ist abgelaufen. Bitte neu anmelden.");
        return;
      }
      if (outcome.status === "error") {
        setError(outcome.message);
        return;
      }

      setResult(outcome.result);
      setMessages((current) => [
        ...current,
        {
          id: nextId(),
          role: "assistant",
          text:
            outcome.result.auto_reply ||
            "Ich habe einen Formularvorschlag erstellt.",
        },
      ]);
    } catch (readError) {
      setError(
        readError instanceof Error
          ? readError.message
          : "Die Screenshots konnten nicht gelesen werden.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-4">
      <ScrollArea className="h-72 rounded-2xl border border-border bg-background">
        <div className="grid gap-3 p-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Beschreibe das Problem in eigenen Worten — oder zieh einen Screenshot
              der Fehlermeldung hier hinein. Die KI schlägt das passende Formular vor
              und füllt aus, was sie erkennt.
            </p>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                // One squared-off corner on the sender's side is the chat
                // convention Google uses — it points the bubble at its author.
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-elev-1",
                message.role === "user"
                  ? "justify-self-end rounded-br-md bg-surface-elevated text-foreground"
                  : "justify-self-start rounded-bl-md border border-border bg-card text-card-foreground",
              )}
            >
              {message.text && <p className="whitespace-pre-wrap">{message.text}</p>}
              {message.images && message.images.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {message.images.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element -- blob: URL, next/image cannot optimise it
                    <img
                      key={src}
                      src={src}
                      alt="Angehängter Screenshot"
                      className="size-20 rounded-xl border border-border object-cover"
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {pending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Analysiere … bei CPU-Inferenz kann das eine Weile dauern.
            </div>
          )}
        </div>
      </ScrollArea>

      {error && (
        <Alert
          variant="destructive"
          className="rounded-2xl border-border px-4 py-3 shadow-elev-1"
        >
          <TriangleAlertIcon strokeWidth={1.5} />
          <AlertTitle>Analyse fehlgeschlagen</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <TriagePreview
          result={result}
          schemas={schemas}
          onAccept={onAccept}
          onDismiss={() => setResult(null)}
        />
      )}

      {/* Composer, doubling as the drop zone. */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        /*
          Strg+V, weil ein Screenshot in der Zwischenablage entsteht und nicht auf
          der Platte. `addFiles` filtert weiterhin auf Bilder und sagt es, wenn
          etwas anderes dabei war — dieser Chat schickt die Anhänge an die
          Bildanalyse, nicht in die Dateiablage.

          Nur wenn Dateien dabei sind: bei kopiertem Text ist `files` leer, und
          ohne die Prüfung verlöre jedes eingefügte Wort sein Standardverhalten.
        */
        onPaste={(event) => {
          const pasted = Array.from(event.clipboardData?.files ?? []);
          if (pasted.length === 0) return;
          event.preventDefault();
          addFiles(pasted);
        }}
        className={cn(
          "grid gap-2 rounded-3xl border border-dashed p-3 transition-colors duration-300",
          dragging ? "border-primary bg-primary/5" : "border-border bg-card",
        )}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => (
              <div
                key={attachment.previewUrl}
                className="flex items-center gap-2 rounded-full border border-border py-1 pr-1 pl-1.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL preview */}
                <img
                  src={attachment.previewUrl}
                  alt=""
                  className="size-7 rounded-full object-cover"
                />
                <span className="max-w-40 truncate text-xs">
                  {attachment.file.name}
                </span>
                <Badge variant="outline" className="rounded-full">
                  {Math.max(1, Math.round(attachment.file.size / 1024))} KB
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`${attachment.file.name} entfernen`}
                  onClick={() => dropAttachment(index)}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line — chat convention.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={
            dragging
              ? "Screenshot hier ablegen …"
              : "z. B. „Outlook startet seit dem Update nicht mehr, Fehler 0x8004010F“"
          }
          rows={3}
          disabled={pending}
          className="resize-none rounded-2xl border-transparent bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              disabled={pending}
              className="hidden"
              onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
            />
            <Button
              type="button"
              className="h-10 rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
              disabled={pending}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlusIcon strokeWidth={1.5} />
              Screenshot
            </Button>
            <span className="text-xs text-muted-foreground">
              oder hierher ziehen
            </span>
          </div>
          <Button
            type="button"
            className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            disabled={!canSend}
            onClick={() => void send()}
          >
            {pending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SendIcon strokeWidth={1.5} />
            )}
            Analysieren
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The model's proposal, with everything the user needs to judge it. */
function TriagePreview({
  result,
  schemas,
  onAccept,
  onDismiss,
}: {
  result: TriageResult;
  schemas: MITSFormSchema[];
  onAccept: (schemaId: string, payload: Record<string, unknown>) => void;
  onDismiss: () => void;
}) {
  const schema = schemas.find(
    (candidate) => candidate.id === result.suggested_category_id,
  );

  if (!schema) {
    return (
      <Alert
        variant="destructive"
        className="rounded-2xl border-border px-4 py-3 shadow-elev-1"
      >
        <TriangleAlertIcon strokeWidth={1.5} />
        <AlertTitle>Unbekanntes Formular</AlertTitle>
        <AlertDescription>
          Die KI hat „{result.suggested_category_id}“ vorgeschlagen — dieses
          Formular kennt MITS nicht.
        </AlertDescription>
      </Alert>
    );
  }

  // Only values the form can actually hold; the rest is dropped rather than
  // shown as if it would be submitted.
  const payload = pickSchemaFields(schema, result.extracted_payload);
  const labels = new Map(
    resolveFields(schema).map((field) => [field.name, field.label] as const),
  );
  const filled = Object.entries(payload);
  const percent = Math.round(result.confidence * 100);
  const lowConfidence = result.confidence < 0.5;

  return (
    <Card className="rounded-3xl border border-border bg-card ring-0 shadow-glow-gemini">
      <CardHeader>
        {/* The Gemini sheen marks the one card whose content a model produced. */}
        <span className="bg-gemini-sheen grid size-11 place-items-center rounded-full text-foreground">
          <SparklesIcon className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <CardTitle className="mt-4 text-lg font-medium">
          Die KI hat folgendes Ticket für dich ausgefüllt
        </CardTitle>
        <CardDescription className="mt-1 leading-relaxed">
          Formular „{schema.title}“ — {filled.length} von{" "}
          {labels.size} Feldern erkannt. Bitte vor dem Absenden prüfen.
        </CardDescription>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge
            variant={lowConfidence ? "destructive" : "default"}
            className="rounded-full"
          >
            Konfidenz {percent} %
          </Badge>
          <Badge variant="outline" className="rounded-full font-mono">
            {schema.id}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="grid gap-4">
        {lowConfidence && (
          <Alert className="rounded-2xl border-border px-4 py-3">
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertTitle>Unsichere Zuordnung</AlertTitle>
            <AlertDescription>
              Die KI ist sich beim Formular nicht sicher. Wenn es nicht passt, nutze
              den Service-Katalog oder das Schnell-Ticket.
            </AlertDescription>
          </Alert>
        )}

        {result.transcribed_text && (
          <div className="grid gap-1.5">
            <span className="label-industrial flex items-center gap-1.5">
              <ScanTextIcon className="size-3.5" strokeWidth={1.5} />
              Aus dem Screenshot gelesen
            </span>
            {/* Mono on purpose: this is verbatim OCR output, where a shifted
                character matters more than the typeface. */}
            <p className="max-h-32 overflow-auto rounded-xl border border-border bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
              {result.transcribed_text}
            </p>
          </div>
        )}

        {filled.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Kein Feld konnte sicher gefüllt werden — das Formular öffnet leer.
          </p>
        ) : (
          <dl className="grid gap-0 divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {filled.map(([name, value]) => (
              <div key={name} className="grid gap-0.5 p-3 sm:grid-cols-[12rem_1fr]">
                <dt className="text-xs font-medium text-muted-foreground">
                  {labels.get(name) ?? name}
                </dt>
                <dd className="text-sm break-words">{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>

      <CardFooter className="flex-wrap justify-end gap-2 rounded-b-3xl border-t border-border bg-transparent">
        <Button variant="ghost" className="rounded-full px-4" onClick={onDismiss}>
          Verwerfen
        </Button>
        <Button
          className="rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          onClick={() => onAccept(schema.id, payload)}
        >
          Prüfen und absenden
        </Button>
      </CardFooter>
    </Card>
  );
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "ja" : "nein";
  return String(value);
}
