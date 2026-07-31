import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The one back link.
 *
 * Every subpage renders this in the same place — top left, above the heading — so
 * the way out sits where it sat on the previous page. Before this, admin pages put
 * a return button in the top right beside the page actions, where it read as one
 * action among several, and the customer pages had none at all.
 *
 * The label is passed whole rather than assembled from a noun: German picks the
 * preposition by gender ("zur Queue", "zum Admin-Desk", "zu meinen Tickets"), and
 * a component cannot know which without a gender table nobody wants to maintain.
 *
 * It names the destination, not the direction. "Zurück" alone says someone may
 * leave, not where they land — the browser's own button already covers "wherever I
 * came from", while this covers "up one level", which is the more useful promise on
 * a page opened from a link in a mail.
 */
export function BackLink({
  href,
  label,
}: {
  href: string;
  /** Complete text, e.g. "Zurück zur Queue". */
  label: string;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="h-8 w-fit rounded-full px-3 text-muted-foreground hover:text-foreground"
    >
      <Link href={href}>
        <ArrowLeftIcon strokeWidth={1.5} />
        {label}
      </Link>
    </Button>
  );
}
