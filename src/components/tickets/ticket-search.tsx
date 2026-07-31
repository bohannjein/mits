import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   Ticket search.

   A plain GET form, not a client component with a fetch. Submitting navigates,
   which means the result is a real URL that can be bookmarked, shared and used
   with the back button — and it works before hydration. The page it targets does
   the number-versus-text decision server-side.
   ────────────────────────────────────────────────────────────────────────── */

export function TicketSearch({
  /** Where to submit — `/tickets` for a reporter, `/board` for staff. */
  action,
  defaultValue = "",
  className,
  /** Compact styling for the header. */
  compact = false,
}: {
  action: string;
  defaultValue?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <form
      action={action}
      // GET so the query lands in the URL. Next intercepts the navigation and
      // re-renders the page as a server render.
      method="get"
      role="search"
      className={cn("relative", className)}
    >
      <SearchIcon
        aria-hidden
        strokeWidth={1.5}
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        name="q"
        defaultValue={defaultValue}
        aria-label="Tickets durchsuchen"
        placeholder={
          compact ? "Ticket suchen …" : "Nummer, Titel oder E-Mail"
        }
        className={cn(
          "rounded-full pl-9",
          compact ? "h-9 w-full sm:w-64" : "h-10 w-full",
        )}
      />
      {/* Submit without JavaScript; Enter in the field triggers it too. */}
      <button type="submit" className="sr-only">
        Suchen
      </button>
    </form>
  );
}
