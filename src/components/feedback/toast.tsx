"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AtSignIcon,
  BellIcon,
  BellRingIcon,
  CheckCircle2Icon,
  MessageSquareIcon,
  TicketIcon,
  TriangleAlertIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  type ToastPosition,
  type ToastTone,
} from "@/types/mits";

export type { ToastTone };

/* ──────────────────────────────────────────────────────────────────────────
   Slide-in notifications, top right.

   **Not in `components/ui/`.** That directory is CLI-managed shadcn output and
   rule 1 forbids hand-written primitives in it. shadcn no longer ships a `toast`
   — the registry points at `sonner`, a separate library with its own styling
   model — so this follows the precedent already set by `components/forms/form.tsx`:
   our code, in our own directory, with the reason written down.

   Two things worth stating about the behaviour:

   **The dismiss timer is per toast and pauses on hover.** A five-second window is
   fine for "Makro ausgeführt" and hostile for a message preview somebody is in the
   middle of reading. Pointer over the stack stops every countdown; leaving
   restarts them.

   **A toast is never the only place something is said.** Everything here is also
   visible in the queue or on the ticket after a refresh, because a notification
   that vanishes after five seconds cannot be the record of anything.
   ────────────────────────────────────────────────────────────────────────── */

/** What kind of event produced it — decides the icon, nothing else. */
export type ToastKind =
  | "reply"
  | "ticket"
  | "assigned"
  | "reminder"
  | "mention"
  | "digest"
  | "system";

export interface ToastInput {
  title: string;
  description?: string;
  /** Makes the whole card a link. Same-origin paths only — see `SAFE_HREF`. */
  href?: string;
  tone?: ToastTone;
  kind?: ToastKind;
  /**
   * Collapses repeats. A second toast with the same key replaces the first
   * instead of stacking — without it, a poll that returns the same event twice
   * (a retry, a refocus) shows the reply twice and the agent goes looking for a
   * second message that does not exist.
   */
  key?: string;
  /**
   * Seconds before it disappears. Omitted follows the instance setting; `0` means
   * it stays until dismissed.
   *
   * Per toast rather than only per channel because the two callers want different
   * things from it: a notification takes its value from the admin's channel
   * config, while a confirmation raised by a macro or a status change is a fixed
   * short one. Neither should have to know about the other's rule.
   */
  seconds?: number;
}

interface ToastRecord extends ToastInput {
  id: string;
}

const ICONS: Record<ToastKind, typeof BellIcon> = {
  reply: MessageSquareIcon,
  ticket: TicketIcon,
  assigned: UserIcon,
  // A ringing bell, not the plain one: this is the only channel somebody asked
  // for by hand, and the digest below already owns the quiet bell.
  reminder: BellRingIcon,
  // Eine Erwähnung ist an eine Person gerichtet und nicht an eine Rolle — das
  // Symbol zeigt jemanden, den man anspricht, nicht eine Nachricht.
  mention: AtSignIcon,
  // The one that stands for several things at once, so a bell rather than any
  // one of the three icons it replaced.
  digest: BellIcon,
  system: CheckCircle2Icon,
};

const TONES: Record<ToastTone, string> = {
  // The accent lives on a thin leading bar rather than on the card, so the body
  // text always sits on `--card` and cannot lose contrast in either theme.
  info: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
};

/** Where each corner puts the stack, and which way new toasts grow. */
const POSITIONS: Record<ToastPosition, string> = {
  // `flex-col-reverse` on the bottom two: a new toast has to appear nearest the
  // corner it is anchored to, or the whole stack jumps up the screen each time
  // one arrives and the one being read moves out from under the cursor.
  "top-right": "top-4 right-4 flex-col",
  "top-left": "top-4 left-4 flex-col",
  "bottom-right": "right-4 bottom-4 flex-col-reverse",
  "bottom-left": "bottom-4 left-4 flex-col-reverse",
};

/**
 * Site-relative paths only.
 *
 * A toast is rendered from data the server assembled, but it is still a link the
 * user is invited to click without reading — so the same rule as the portal tiles,
 * minus the http(s) branch. Nothing here has any business leaving the origin.
 */
const SAFE_HREF = /^\/(?!\/)/;

interface ToastApi {
  toast: (input: ToastInput) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Imperative access.
 *
 * Returns a no-op outside a provider rather than throwing. A component that shows
 * a confirmation toast should not be the reason a page fails to render, and the
 * provider is deliberately absent on the auth screens.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  const fallback = useMemo<ToastApi>(
    () => ({ toast: () => {}, dismiss: () => {} }),
    [],
  );
  return api ?? fallback;
}

export function ToastProvider({
  children,
  /**
   * Resolved on the server and handed down, so the first toast of a session is
   * already in the right corner. Defaulted rather than required: the provider
   * sits in the root layout and the auth screens render before there is anything
   * to configure.
   */
  settings = DEFAULT_NOTIFICATION_SETTINGS,
}: {
  children: ReactNode;
  settings?: NotificationSettings;
}) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    counter.current += 1;
    const id = `toast-${counter.current}`;

    setToasts((current) => {
      // Replace a same-key toast in place, so a repeated event updates rather
      // than stacks. Everything else is appended.
      const withoutDuplicate = input.key
        ? current.filter((entry) => entry.key !== input.key)
        : current;
      // Cap the stack at what the admin allows. Past about four the lower cards
      // are covered anyway, and the oldest are the ones already read.
      return [...withoutDuplicate, { ...input, id }].slice(-settings.maxVisible);
    });
  }, [settings.maxVisible]);

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport
        toasts={toasts}
        onDismiss={dismiss}
        position={settings.position}
        defaultSeconds={settings.seconds}
      />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
  position,
  defaultSeconds,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
  position: ToastPosition;
  defaultSeconds: number;
}) {
  const [paused, setPaused] = useState(false);

  return (
    <div
      // `pointer-events-none` on the container and `auto` on each card: the empty
      // space beside a toast must not swallow clicks on the page behind it.
      className={cn(
        "pointer-events-none fixed z-50 flex w-[min(22rem,calc(100vw-2rem))] gap-2 print:hidden",
        POSITIONS[position],
      )}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      // Announced, not interrupting: an agent typing a reply should not have their
      // screen reader cut mid-sentence by a pool notification.
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((entry) => (
          <ToastCard
            key={entry.id}
            toast={entry}
            paused={paused}
            defaultSeconds={defaultSeconds}
            onDismiss={() => onDismiss(entry.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({
  toast,
  paused,
  defaultSeconds,
  onDismiss,
}: {
  toast: ToastRecord;
  paused: boolean;
  defaultSeconds: number;
  onDismiss: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const Icon = ICONS[toast.kind ?? "system"];
  const tone = TONES[toast.tone ?? "info"];

  /*
   * The countdown restarts whenever `paused` flips back to false.
   *
   * Restarting rather than resuming a remainder: somebody who hovered was reading,
   * and giving them the full window again when they move away is the forgiving
   * direction. The alternative needs a stored remainder and a second clock.
   */
  const seconds = toast.seconds ?? defaultSeconds;

  useEffect(() => {
    if (paused) return;
    // Zero is "stays until dismissed" — the channel setting an admin turns on for
    // the one notification that must not scroll past unread.
    if (seconds <= 0) return;
    const timer = window.setTimeout(onDismiss, seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [paused, seconds, onDismiss]);

  const linkable = toast.href !== undefined && SAFE_HREF.test(toast.href);

  const body = (
    <>
      <span aria-hidden className={cn("w-1 shrink-0 rounded-full", tone)} />
      <Icon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        strokeWidth={1.5}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{toast.title}</span>
        {/* `whitespace-pre-line`: a digest puts one event per line, and the
            separator has to survive as a line break rather than collapsing into
            a space. Ordinary one-line descriptions are unaffected. */}
        {toast.description && (
          <span className="mt-0.5 line-clamp-4 block text-xs whitespace-pre-line text-muted-foreground">
            {toast.description}
          </span>
        )}
      </span>
    </>
  );

  return (
    <motion.div
      layout
      // Springs, not durations — the house rule. `useReducedMotion` is checked
      // explicitly because framer-motion does not do it on its own.
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 48, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 48, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.8 }}
      className="pointer-events-auto"
    >
      <div className="relative flex items-start gap-2.5 rounded-2xl border border-border bg-card py-3 pr-9 pl-2.5 shadow-elev-3">
        {linkable ? (
          <Link
            href={toast.href!}
            onClick={onDismiss}
            // The whole card is the target; the close button sits above it with
            // its own stacking context so it is not swallowed by the overlay.
            className="flex flex-1 items-start gap-2.5 rounded-xl outline-ring/50 after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-2"
          >
            {body}
          </Link>
        ) : (
          <div className="flex flex-1 items-start gap-2.5">{body}</div>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          aria-label="Benachrichtigung schließen"
          className="absolute top-2 right-2 z-10 size-6 rounded-lg p-0 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <XIcon className="size-3.5" strokeWidth={1.5} />
        </Button>
      </div>
    </motion.div>
  );
}

/** Re-exported so a caller can render the same icon set outside a toast. */
export const TOAST_ICONS = ICONS;
export { TriangleAlertIcon as ToastWarningIcon };
