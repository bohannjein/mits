import { cn } from "@/lib/utils";
import type { PayloadField } from "@/lib/ticket-opening";

/* ──────────────────────────────────────────────────────────────────────────
   The answers somebody gave to a form, as a list.

   One component for all three places they appear — inside the opening bubble, in
   the agent's sidebar, in the reporter's accordion. Three copies of the same `<dl>`
   were three places for one answer to start looking different, on a page where a
   reporter and an agent are reading the same submission side by side.

   A server component: nothing here is interactive, and the values arrive resolved.
   ────────────────────────────────────────────────────────────────────────── */

export function PayloadFields({
  fields,
  /**
   * `bubble` sits inside a chat bubble and needs a rule above it: the answers
   * follow the reporter's own words in the same box, and without a separator the
   * first label reads as part of the last sentence.
   */
  variant = "panel",
}: {
  fields: PayloadField[];
  variant?: "panel" | "bubble";
}) {
  if (fields.length === 0) return null;

  return (
    <dl
      className={cn(
        "grid gap-3",
        variant === "bubble" && "mt-3 border-t border-border/60 pt-3",
      )}
    >
      {fields.map((field) => (
        <div key={field.name} className="grid gap-0.5">
          <dt className="text-xs text-muted-foreground">{field.label}</dt>
          <dd className="text-sm break-words whitespace-pre-wrap">{field.text}</dd>
        </div>
      ))}
    </dl>
  );
}
