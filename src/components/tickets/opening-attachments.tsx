import { FileIcon, FileTextIcon } from "lucide-react";

import { formatFileSize, type AttachmentMeta } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Die Anhänge der Erstmeldung, in ihrer Bubble.

   Ein Screenshot, den jemand beim Anlegen mitschickt, ist Teil seiner ersten
   Nachricht und nicht eine Zeile in einer zugeklappten Liste daneben. Bisher stand
   er nur in der Sammlung neben dem Verlauf — der Agent las die Frage und musste
   das Bild dazu suchen. Die Sammlung bleibt; sie ist der Ort, an dem man *alle*
   Dateien eines Tickets findet, auch die aus späteren Antworten.

   **Kein eigener Viewer.** Ein Bild wird als `<img>` auf `/api/uploads/<id>?inline=1`
   gerendert, alles andere als `<a>` mit dem Dateinamen als Text — genau das Markup,
   das `AttachmentViewer` an der Nachrichtenliste ohnehin abfängt. Damit öffnet ein
   Klick denselben Dialog wie bei einem eingebetteten Bild aus einer Antwort, und es
   gibt keine zweite Vorschau, die man richtig halten muss.

   **Der Dateiname steht im `title`, nicht nur im Text.** Der Viewer entscheidet an
   ihm, ob eine Datei eine PDF-Vorschau bekommt, und der Linktext trägt hier
   zusätzlich die Größe — „bericht.pdf1,2 MB" endet nicht auf `.pdf`. Deshalb liest
   `AttachmentViewer` jetzt `title` zuerst und fällt auf den Text zurück, den die
   Links aus dem Antwortfeld tragen. Ohne das wäre das Fehlerbild „bei manchen PDFs
   geht die Vorschau nicht".

   Server Component: nichts hier hat Zustand, und der Klick gehört dem Viewer weiter
   oben.
   ────────────────────────────────────────────────────────────────────────── */

export function OpeningAttachments({
  attachments,
}: {
  attachments: AttachmentMeta[];
}) {
  if (attachments.length === 0) return null;

  const images = attachments.filter((entry) =>
    entry.type.startsWith("image/"),
  );
  const others = attachments.filter(
    (entry) => !entry.type.startsWith("image/"),
  );

  return (
    <div className="grid gap-2">
      {/*
        Bilder zuerst und als Raster.

        Sie sind der Grund für das Ganze: bei einem Screenshot ist der Inhalt die
        Information, bei einem Log der Name. Gedeckelt auf `max-h-48` je Kachel —
        ein Handyfoto im Hochformat nimmt sonst die Bubble und schiebt die Antwort
        des Agenten aus dem Bild. In voller Größe ist es einen Klick entfernt.
      */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((entry) => (
            // eslint-disable-next-line @next/next/no-img-element -- authentifizierte Route, next/image bräuchte einen eigenen Loader
            <img
              key={entry.fileId}
              src={`/api/uploads/${entry.fileId}?inline=1`}
              alt={entry.name}
              title={entry.name}
              className="max-h-48 max-w-full cursor-zoom-in rounded-xl border border-border bg-background object-contain"
            />
          ))}
        </div>
      )}

      {others.map((entry) => {
        const pdf = /\.pdf$/i.test(entry.name);
        const Icon = pdf ? FileTextIcon : FileIcon;

        return (
          <a
            key={entry.fileId}
            href={`/api/uploads/${entry.fileId}`}
            /*
              `title` ist hier nicht der Tooltip, sondern die Angabe, an der
              `AttachmentViewer` den Dateityp erkennt. Der Linktext trägt zusätzlich
              die Größe, endet also nicht auf `.pdf` — ohne dieses Attribut bekäme
              eine PDF hier keine Vorschau, und das Fehlerbild wäre „bei manchen
              PDFs geht es nicht".
            */
            title={entry.name}
            /*
             * Hintergrund bewegt sich beim Hover, Vordergrund bleibt auf vollem
             * Kontrast — die Hover-Regel. Kein `target="_blank"`: eine PDF öffnet
             * der Viewer im Dialog, und alles andere ist ein Download, der die
             * Seite nicht verlässt.
             */
            className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Icon
              className="size-4 shrink-0 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatFileSize(entry.size)}
            </span>
          </a>
        );
      })}
    </div>
  );
}
