import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { pagesToShow } from "@/lib/ticket-paging";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   Paging for a ticket list.

   Links, not a client component — the same reasoning as the sortable headers and
   the queue tabs. A page is a URL, so it is shareable and bookmarkable, the back
   button works, and the active page is known server-side with nothing to hydrate.

   Renders nothing at all for a single page. A pager under a list of nine tickets
   is furniture that implies there is more.
   ────────────────────────────────────────────────────────────────────────── */


export function TicketPager({
  basePath,
  searchParams,
  page,
  pageCount,
  total,
  perPage,
}: {
  basePath: string;
  /** Carried through, so paging keeps the tab, the filters and the sort. */
  searchParams: Record<string, string | string[] | undefined>;
  page: number;
  pageCount: number;
  total: number;
  perPage: number;
}) {
  if (pageCount <= 1) return null;

  const href = (target: number): string => {
    const query = new URLSearchParams();

    /*
     * Rebuilt from the incoming params rather than from a known list of keys. A
     * filter added later would silently be dropped by the latter, and paging that
     * quietly widened the result set is the failure this whole component has to
     * avoid.
     */
    for (const [name, value] of Object.entries(searchParams)) {
      if (name === "page") continue;
      const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
      for (const entry of values) if (entry !== "") query.append(name, entry);
    }

    query.set("page", String(target));
    return `${basePath}?${query.toString()}`;
  };

  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <nav
      aria-label="Seiten"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <span className="text-xs text-muted-foreground tabular-nums">
        {/* The range, not just the page number: "51–100 von 237" answers where you
            are and how much is left in one line. */}
        {first}–{last} von {total}
      </span>

      <div className="flex flex-wrap items-center gap-1">
        <Step
          href={href(page - 1)}
          disabled={page <= 1}
          label="Vorherige Seite"
          icon={<ChevronLeftIcon strokeWidth={1.5} />}
        />

        {pagesToShow(page, pageCount).map((entry, index) =>
          entry === null ? (
            // A gap, not a link. Rendered as a span so it is not tabbable.
            <span
              key={`gap-${index}`}
              aria-hidden
              className="px-1.5 text-xs text-muted-foreground"
            >
              …
            </span>
          ) : (
            <Button
              key={entry}
              asChild
              variant="ghost"
              size="sm"
              className={cn(
                "h-9 min-w-9 rounded-full px-3 text-xs tabular-nums",
                entry === page
                  ? "bg-inverse-surface text-inverse-surface-foreground hover:bg-inverse-surface-hover hover:text-inverse-surface-foreground"
                  : "text-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Link
                href={href(entry)}
                aria-current={entry === page ? "page" : undefined}
              >
                {entry}
              </Link>
            </Button>
          ),
        )}

        <Step
          href={href(page + 1)}
          disabled={page >= pageCount}
          label="Nächste Seite"
          icon={<ChevronRightIcon strokeWidth={1.5} />}
        />
      </div>
    </nav>
  );
}

/**
 * One arrow.
 *
 * Rendered as a disabled `<span>` at the ends rather than as a link to a page that
 * does not exist. A disabled-looking link that still navigates is worse than
 * either, and `aria-disabled` on an anchor does not stop a click.
 */
function Step({
  href,
  disabled,
  label,
  icon,
}: {
  href: string;
  disabled: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-full text-muted-foreground opacity-40"
      >
        {icon}
      </span>
    );
  }

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="size-9 rounded-full p-0 text-foreground hover:bg-accent hover:text-accent-foreground"
    >
      <Link href={href} aria-label={label}>
        {icon}
      </Link>
    </Button>
  );
}

