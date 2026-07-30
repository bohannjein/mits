import { cn } from "@/lib/utils";
import {
  SERVICE_STATE_LABELS,
  type PortalService,
  type ServiceState,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Service status board.

   A server component: the states come from the settings store and never change
   client-side, so there is nothing to hydrate.
   ────────────────────────────────────────────────────────────────────────── */

/** Derived from tokens, so both themes follow along. */
const DOT: Record<ServiceState, string> = {
  operational: "bg-success",
  degraded: "bg-warning",
  down: "bg-destructive",
};

const TEXT: Record<ServiceState, string> = {
  operational: "text-muted-foreground",
  degraded: "text-warning",
  down: "text-destructive",
};

export function ServiceStatus({
  title,
  services,
}: {
  title: string;
  services: PortalService[];
}) {
  if (services.length === 0) return null;

  return (
    <section aria-label={title} className="grid gap-3">
      <h2 className="label-industrial">{title}</h2>

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-elev-1">
        {services.map((service) => (
          <li
            key={service.id}
            className="flex flex-wrap items-center gap-3 px-5 py-3"
          >
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-full", DOT[service.state])}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {service.label}
            </span>
            {service.note && (
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {service.note}
              </span>
            )}
            <span className={cn("shrink-0 text-xs", TEXT[service.state])}>
              {SERVICE_STATE_LABELS[service.state]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
