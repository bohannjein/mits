import { ExternalLinkIcon, LinkIcon, PaperclipIcon } from "lucide-react";

import { RelativeTime } from "@/components/layout/relative-time";
// `formatBytes` lives in types/mits.ts and is what every other size in MITS
// uses. A second one here would be a second rounding rule for the same number.
import type { SharedLink } from "@/lib/ticket-resources";
import { formatBytes } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Files and links from this ticket, in one place.

   A server component: everything here is already resolved by the page, nothing is
   interactive beyond following a link, and the download route checks access per
   request anyway.

   **Renders `null` when both halves are empty.** Same house rule as `ResourceGrid`
   and `AnnouncementBanner` — an empty card that says "keine Dateien" is a card
   somebody has to read before learning there is nothing to read.
   ────────────────────────────────────────────────────────────────────────── */

export interface SharedFile {
  id: string;
  name: string;
  bytes: number;
  createdAt: Date;
}

export function TicketResources({
  files,
  links,
}: {
  files: SharedFile[];
  links: SharedLink[];
}) {
  if (files.length === 0 && links.length === 0) return null;

  return (
    <div className="grid gap-4">
      {files.length > 0 && (
        <section className="grid gap-2">
          <h3 className="flex items-center gap-2 text-xs text-muted-foreground">
            <PaperclipIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
            Dateien ({files.length})
          </h3>
          <ul className="grid gap-1">
            {files.map((file) => (
              <li key={file.id}>
                {/*
                  Straight to the download route, which re-checks access for this
                  request. The panel showing a file is not what makes it readable.
                */}
                <a
                  href={`/api/uploads/${file.id}`}
                  title={file.name}
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                    {formatBytes(file.bytes)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {links.length > 0 && (
        <section className="grid gap-2">
          <h3 className="flex items-center gap-2 text-xs text-muted-foreground">
            <LinkIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
            Links ({links.length})
          </h3>
          <ul className="grid gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  title={link.href}
                  /*
                   * `noopener noreferrer` on a target that leaves the origin: these
                   * addresses came out of message bodies, so some of them were
                   * written by whoever mailed in. `noopener` is what stops the
                   * opened page reaching back through `window.opener`.
                   */
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 rounded-xl px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <ExternalLinkIcon
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{link.label}</span>
                    {/* Who put it there and when — the two things that turn a list
                        of addresses back into a conversation. */}
                    <span className="block truncate text-xs text-muted-foreground">
                      {link.author} ·{" "}
                      <RelativeTime date={link.createdAt} />
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
