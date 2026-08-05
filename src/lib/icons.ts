import {
  AppWindowIcon,
  BookOpenIcon,
  BotIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  HeadsetIcon,
  KeyRoundIcon,
  LaptopIcon,
  ListChecksIcon,
  LockIcon,
  MonitorSmartphoneIcon,
  PenLineIcon,
  PrinterIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TicketIcon,
  UserPlusIcon,
  WifiIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Icons a form schema or a portal resource tile may reference by name.
 *
 * An explicit allow-list rather than a dynamic lookup into lucide-react: the
 * `icon` values arrive as untrusted strings (schema definitions and admin input),
 * and importing the whole icon set to resolve them would pull thousands of
 * components into the client bundle.
 */
const ICONS: Record<string, LucideIcon> = {
  // Added for the category tiles: „Software" needs a window, and `Laptop` and
  // `KeyRound` below already cover the other two an intake starts with.
  AppWindow: AppWindowIcon,
  BookOpen: BookOpenIcon,
  Bot: BotIcon,
  Download: DownloadIcon,
  ExternalLink: ExternalLinkIcon,
  FileText: FileTextIcon,
  Headset: HeadsetIcon,
  KeyRound: KeyRoundIcon,
  Laptop: LaptopIcon,
  ListChecks: ListChecksIcon,
  Lock: LockIcon,
  MonitorSmartphone: MonitorSmartphoneIcon,
  PenLine: PenLineIcon,
  Printer: PrinterIcon,
  ShieldAlert: ShieldAlertIcon,
  ShieldCheck: ShieldCheckIcon,
  Ticket: TicketIcon,
  UserPlus: UserPlusIcon,
  Wifi: WifiIcon,
  Wrench: WrenchIcon,
};

/** Names the admin UI offers for resource tiles. */
export const ICON_NAMES = Object.keys(ICONS).sort();

export function iconFor(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || TicketIcon;
}
