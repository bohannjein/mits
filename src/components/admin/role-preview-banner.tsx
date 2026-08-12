import Link from "next/link";
import { EyeIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  RESTRICTABLE_ROLES,
  type RestrictableRole,
} from "@/types/mits";

const ROLE_NAMES: Record<RestrictableRole, string> = {
  user: "Anwender",
  agent: "Agent",
};

/**
 * Der Balken über einer Seite, die man in fremder Sicht ansieht.
 *
 * Er muss unübersehbar sein und darf trotzdem nicht wie ein Fehler aussehen —
 * eine Vorschau, die man für den echten Zustand hält, ist schlimmer als keine.
 * Deshalb die Warnfarbe und nicht `destructive`: es ist nichts kaputt, es ist nur
 * nicht das, was man selbst sieht.
 *
 * Die Rollen stehen als Knöpfe darin, nicht in einer Auswahlliste. Zwei Ziele,
 * und der Wechsel ist eine Navigation — ein `<select>` bräuchte ein Formular oder
 * einen Client-Handler für etwas, das ein Link ist.
 */
export function RolePreviewBanner({
  active,
  /** Wohin „Vorschau beenden" führt. Derselbe Pfad ohne `?preview=`. */
  basePath,
}: {
  active: RestrictableRole;
  basePath: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3">
      <EyeIcon className="size-4 shrink-0 text-warning" strokeWidth={1.5} aria-hidden />
      <p className="text-sm">
        Vorschau in der Sicht{" "}
        <span className="font-medium">{ROLE_NAMES[active]}</span>. Formulare und
        Bereiche sind so eingeschränkt, wie diese Rolle sie sieht.
      </p>

      <div className="ml-auto flex flex-wrap gap-2">
        {RESTRICTABLE_ROLES.filter((role) => role !== active).map((role) => (
          <Button
            key={role}
            asChild
            size="sm"
            variant="ghost"
            className="h-8 rounded-full px-3 text-xs"
          >
            <Link href={`${basePath}?preview=${role}`}>
              Als {ROLE_NAMES[role]}
            </Link>
          </Button>
        ))}
        <Button
          asChild
          size="sm"
          className="h-8 rounded-full bg-surface-elevated px-3 text-xs text-foreground hover:bg-accent"
        >
          <Link href={basePath}>Vorschau beenden</Link>
        </Button>
      </div>
    </div>
  );
}
