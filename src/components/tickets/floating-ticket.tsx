"use client";

import { GripHorizontalIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDetachedTicket } from "@/components/tickets/detached-ticket-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   The pinned chat panel. Mounted once, near the root, so it survives navigation.

   **The body is an `<iframe>` of the pop-out route.** That is the decision worth
   defending, because a component rendering the conversation directly would look
   more idiomatic:

   The thread is server-rendered, and every rule about who may read what lives on
   that side — `listCommentsFor` filters internal notes in SQL, `getTicketFor`
   answers null for a foreign ticket. Rendering it again in a client component
   means a second path fetching comments, and therefore a second place deciding
   what to hand out. That is the failure this codebase has spent its whole life
   avoiding, and it is not worth an iframe's worth of tidiness.

   Same origin, same session cookie, same guards, same realtime stream. The panel
   is a frame around a page that already exists, and the page does not know or
   care that it is inside one.

   Dragged by its own header rather than by a library: a title bar and two edges
   is what this needs, and the smallest draggable-panel dependency is heavier than
   the twenty lines below.
   ────────────────────────────────────────────────────────────────────────── */

/** Where it sits before anybody moves it — the corner the brief asks for. */
const MARGIN = 16;
const WIDTH = 384;
const HEIGHT = 520;

export function FloatingTicket() {
  const { detached, reattach } = useDetachedTicket();
  const pathname = usePathname();

  /*
   * Never inside a detached view. Without this the panel renders itself.
   *
   * The provider sits at the root, so the pop-out document has one too — and the
   * `BroadcastChannel` faithfully tells it that a ticket is detached. Its own
   * `FloatingTicket` would then open an iframe on the pop-out route, whose
   * document would do the same, and so on until the browser gives up.
   *
   * Two conditions rather than one, because there are two detached views and they
   * differ: the panel's body is a frame (`self !== top`), and the pop-out is a
   * top-level window that happens to be on the pop-out path.
   */
  const framed = typeof window !== "undefined" && window.self !== window.top;
  const isDetachedView = framed || pathname?.endsWith("/popout");

  /*
   * Position in pixels from the top-left, or `null` while it still sits in its
   * default corner.
   *
   * Null rather than a computed corner, so a window resize keeps it in the corner
   * until somebody has actually dragged it. A panel that starts at a remembered
   * pixel offset ends up half off-screen on the next laptop.
   */
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const panel = event.currentTarget.parentElement;
      if (!panel) return;
      const box = panel.getBoundingClientRect();
      drag.current = { dx: event.clientX - box.left, dy: event.clientY - box.top };
      // Capture, so the drag survives the pointer crossing the iframe — without
      // it the frame swallows the move events and the panel sticks mid-gesture.
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const offset = drag.current;
    if (!offset) return;

    /*
     * Clamped to the viewport on every axis.
     *
     * A panel dragged past the top edge takes its own drag handle with it, and
     * there is then no way to get it back short of reloading. The clamp keeps the
     * header reachable whatever the gesture asked for.
     */
    const x = Math.min(
      Math.max(0, event.clientX - offset.dx),
      Math.max(0, window.innerWidth - WIDTH),
    );
    const y = Math.min(
      Math.max(0, event.clientY - offset.dy),
      Math.max(0, window.innerHeight - HEIGHT),
    );
    setPosition({ x, y });
  }, []);

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  // Back to the corner when the viewport shrinks past where it was left.
  useEffect(() => {
    if (!position) return;
    const onResize = () => {
      if (
        position.x > window.innerWidth - WIDTH ||
        position.y > window.innerHeight - HEIGHT
      ) {
        setPosition(null);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [position]);

  if (isDetachedView) return null;
  if (!detached || detached.mode !== "floating") return null;

  return (
    <section
      aria-label={`Ticket ${detached.label}`}
      style={
        position
          ? { left: position.x, top: position.y, width: WIDTH, height: HEIGHT }
          : {
              right: MARGIN,
              bottom: MARGIN,
              width: WIDTH,
              height: HEIGHT,
            }
      }
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-elev-3",
        // Hidden on a phone: a 384-pixel panel over a 380-pixel viewport is not a
        // floating window, it is the page with a border. The pop-out button stays.
        "hidden sm:flex",
      )}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex shrink-0 cursor-grab touch-none items-center gap-2 border-b border-border bg-card px-3 py-2 active:cursor-grabbing"
      >
        <GripHorizontalIcon
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {detached.label}
        </span>

        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          className="rounded-full text-muted-foreground"
          title="Im Hauptfenster öffnen"
        >
          <a href={`/mits/tickets/${detached.ticketId}`} onClick={reattach}>
            <ExternalLinkIcon strokeWidth={1.5} />
            <span className="sr-only">Im Hauptfenster öffnen</span>
          </a>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={reattach}
          className="rounded-full text-muted-foreground"
          title="Zurück ins Hauptfenster"
        >
          <XIcon strokeWidth={1.5} />
          <span className="sr-only">Zurück ins Hauptfenster</span>
        </Button>
      </div>

      {/*
        `key` on the ticket id: detaching a different ticket has to load the other
        conversation rather than leave the previous one in a frame whose `src`
        React considers unchanged.
      */}
      <iframe
        key={detached.ticketId}
        src={`/mits/tickets/${detached.ticketId}/popout`}
        title={`Ticket ${detached.label}`}
        className="min-h-0 flex-1 border-0"
      />
    </section>
  );
}
