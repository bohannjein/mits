import {
  BoxIcon,
  CloudCogIcon,
  KeyRoundIcon,
  LaptopIcon,
  NetworkIcon,
  SmartphoneIcon,
  SquareTerminalIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { CIType } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   One icon per object type.

   A list of inventory rows is a list of names, and a name is the slowest thing to
   scan — "MITS-NB-0431" and "MITS-NB-0413" are the same shape. The icon is what
   lets somebody find the laptop among four licences without reading.

   In its own file rather than inside the sidebar widget: the CMDB pages, the
   ticket sidebar and the search results all render the same rows, and three
   copies of this map is three chances for a licence to look like a laptop in one
   of them.

   Deliberately not colour-coded. Seven types would need seven hues, none of them
   from the token set, and the design language has exactly one accent — the shape
   carries the meaning here.
   ────────────────────────────────────────────────────────────────────────── */

const ICONS: Record<CIType, typeof BoxIcon> = {
  hardware: LaptopIcon,
  software: SquareTerminalIcon,
  license: KeyRoundIcon,
  network: NetworkIcon,
  mobile: SmartphoneIcon,
  service: CloudCogIcon,
  // The catch-all gets a literal box rather than a question mark: "other" is a
  // legitimate answer from the importer, not a defect somebody has to resolve.
  other: BoxIcon,
};

export function CIIcon({
  type,
  className,
}: {
  type: CIType;
  className?: string;
}) {
  const Icon = ICONS[type] ?? BoxIcon;
  return (
    <Icon
      className={cn("size-4 shrink-0 text-muted-foreground", className)}
      strokeWidth={1.5}
      aria-hidden
    />
  );
}
