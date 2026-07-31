import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CI_STATUS_LABELS,
  CI_TYPE_LABELS,
  type CIStatus,
  type MITSConfigurationItem,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   The item list.

   A server component: every value is already resolved by the page, so there is nothing
   to hydrate. Owner and site come in as name maps rather than being looked up per row —
   a per-row query is the N+1 that only shows up once an instance has real data.

   Scrolls inside its own container, so a long inventory does not push the page. Same
   rule as everywhere in the split layout.
   ────────────────────────────────────────────────────────────────────────── */

/** Muted for anything not in service, so the live fleet reads first. */
const STATUS_TONE: Record<CIStatus, string> = {
  active: "",
  stock: "text-muted-foreground",
  repair: "text-warning",
  retired: "text-muted-foreground line-through",
};

export function CITable({
  items,
  organizationNames,
  locationNames,
  userNames,
}: {
  items: MITSConfigurationItem[];
  organizationNames: Record<string, string>;
  locationNames: Record<string, string>;
  userNames: Record<string, string>;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Objekt</TableHead>
            <TableHead className="hidden sm:table-cell">Art</TableHead>
            <TableHead className="hidden md:table-cell">Firma</TableHead>
            <TableHead className="hidden lg:table-cell">Standort</TableHead>
            <TableHead className="hidden lg:table-cell">Zugeordnet</TableHead>
            <TableHead>Zustand</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className="hover:bg-accent/40">
              <TableCell className="max-w-0">
                <Link
                  href={`/mits/cmdb/${item.id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {item.name}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">
                  {[item.asset_tag, item.manufacturer, item.model]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
              </TableCell>

              <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground sm:table-cell">
                {CI_TYPE_LABELS[item.type]}
              </TableCell>

              <TableCell className="hidden max-w-40 truncate text-sm text-muted-foreground md:table-cell">
                {item.organization_id
                  ? (organizationNames[item.organization_id] ?? "—")
                  : "—"}
              </TableCell>

              <TableCell className="hidden max-w-32 truncate text-sm text-muted-foreground lg:table-cell">
                {item.location_id ? (locationNames[item.location_id] ?? "—") : "—"}
              </TableCell>

              <TableCell className="hidden max-w-40 truncate text-sm text-muted-foreground lg:table-cell">
                {item.assigned_user_id
                  ? (userNames[item.assigned_user_id] ?? "—")
                  : "—"}
              </TableCell>

              <TableCell>
                <Badge
                  variant="outline"
                  className={`rounded-full font-normal ${STATUS_TONE[item.status]}`}
                >
                  {CI_STATUS_LABELS[item.status]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
