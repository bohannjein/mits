"use client";

import {
  ImagePlusIcon,
  InfoIcon,
  Loader2Icon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { extractTicketDraft } from "@/lib/ai/extract";
import { CATALOG_SCHEMAS } from "@/lib/mock-schemas";
import { cn } from "@/lib/utils";

interface Attachment {
  file: File;
  /** Object URL for the thumbnail; revoked when the attachment is dropped. */
  previewUrl: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  images?: string[];
}

/**
 * Free-text intake. The UI is complete; the routing call behind it
 * (`extractTicketDraft`) reports "unavailable" until the FastAPI/Ollama backend
 * lands in Phase 3, and the assistant says so rather than inventing an answer.
 */
export function AiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageCounter = useRef(0);
  /**
   * Every object URL handed out, so unmount can release them all. Sent
   * attachments stay alive here on purpose — their thumbnails are still on
   * screen in the message thread after the composer has been cleared.
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

  const addAttachments = (files: File[]) => {
    const added = files.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrls.current.add(previewUrl);
      return { file, previewUrl };
    });
    setAttachments((current) => [...current, ...added]);
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

  const canSend = (input.trim().length > 0 || attachments.length > 0) && !pending;

  const send = async () => {
    if (!canSend) return;

    const text = input.trim();
    const images = attachments.map((a) => a.previewUrl);
    const files = attachments.map((a) => a.file);

    setMessages((current) => [
      ...current,
      { id: nextId(), role: "user", text, images },
    ]);
    setInput("");
    setAttachments([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPending(true);

    try {
      const result = await extractTicketDraft({
        text,
        images: files,
        candidates: CATALOG_SCHEMAS,
      });

      setMessages((current) => [
        ...current,
        {
          id: nextId(),
          role: "assistant",
          text:
            result.status === "ok"
              ? `Passendes Formular erkannt: ${result.schemaId} (Konfidenz ${Math.round(result.confidence * 100)} %).`
              : result.reason,
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-4">
      <Alert className="rounded-sm border-2">
        <InfoIcon />
        <AlertTitle>KI-Routing folgt in Phase 3</AlertTitle>
        <AlertDescription>
          Eingabe und Upload funktionieren schon; die Übersetzung in eine
          Formular-Payload übernimmt später das FastAPI-Backend mit Ollama.
        </AlertDescription>
      </Alert>

      <ScrollArea className="h-80 rounded-sm border-2 border-border">
        <div className="grid gap-3 p-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Beschreibe das Problem in eigenen Worten — oder wirf einen
              Screenshot der Fehlermeldung hier hinein.
            </p>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-sm border-2 border-border px-3 py-2 text-sm",
                message.role === "user"
                  ? "justify-self-end bg-secondary text-secondary-foreground"
                  : "justify-self-start bg-card text-card-foreground",
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
                      className="size-20 rounded-sm border-2 border-border object-cover"
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {pending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Analysiere …
            </div>
          )}
        </div>
      </ScrollArea>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment, index) => (
            <div
              key={attachment.previewUrl}
              className="flex items-center gap-2 rounded-sm border-2 border-border px-2 py-1"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL preview */}
              <img
                src={attachment.previewUrl}
                alt=""
                className="size-8 rounded-sm object-cover"
              />
              <span className="max-w-40 truncate text-xs">
                {attachment.file.name}
              </span>
              <Badge variant="outline" className="rounded-sm font-mono">
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

      <div className="grid gap-2">
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
          placeholder="z. B. „Outlook startet seit dem Update nicht mehr, Fehler 0x8004010F“"
          rows={3}
          disabled={pending}
          className="rounded-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              disabled={pending}
              className="hidden"
              onChange={(event) =>
                addAttachments(Array.from(event.target.files ?? []))
              }
            />
            <Button
              type="button"
              variant="outline"
              className="rounded-sm"
              disabled={pending}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlusIcon />
              Screenshot
            </Button>
          </div>
          <Button
            type="button"
            className="rounded-sm"
            disabled={!canSend}
            onClick={() => void send()}
          >
            {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            Senden
          </Button>
        </div>
      </div>
    </div>
  );
}
