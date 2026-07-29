import {
  BotIcon,
  KeyRoundIcon,
  LaptopIcon,
  ListChecksIcon,
  PenLineIcon,
  TicketIcon,
  UserPlusIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons a form schema may reference by name.
 *
 * An explicit allow-list rather than a dynamic lookup into lucide-react: schema
 * `icon` values arrive as untrusted strings, and importing the whole icon set to
 * resolve them would pull thousands of components into the client bundle.
 */
const ICONS: Record<string, LucideIcon> = {
  Bot: BotIcon,
  KeyRound: KeyRoundIcon,
  Laptop: LaptopIcon,
  ListChecks: ListChecksIcon,
  PenLine: PenLineIcon,
  Ticket: TicketIcon,
  UserPlus: UserPlusIcon,
  Wrench: WrenchIcon,
};

export function iconFor(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || TicketIcon;
}
