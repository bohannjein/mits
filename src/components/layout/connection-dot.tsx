"use client";

import { ActivityIcon, WifiIcon, WifiOffIcon } from "lucide-react";

import { useRealtimeStatus } from "@/hooks/use-realtime";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   Live status, in one dot.

   Small on purpose. It answers a question that is only asked when something feels
   wrong — "is this page still updating?" — and a badge that announces a working
   connection all day is chrome nobody needed.

   Three states rather than two, because "connecting" and "gave up" are different
   things to a person deciding whether to press F5. The colours are the presence
   tokens the queue already uses, so a green dot means the same thing in both
   places.

   The icon carries the state as well as the colour: `--success` and `--warning`
   are the pair a red-green colour blind reader is least able to separate, and
   this is the one control on the page whose entire content is a colour.
   ────────────────────────────────────────────────────────────────────────── */

const STATES = {
  live: {
    icon: WifiIcon,
    dot: "bg-success",
    label: "Live verbunden",
    detail: "Neue Nachrichten erscheinen sofort.",
  },
  connecting: {
    icon: ActivityIcon,
    dot: "bg-muted-foreground/50",
    label: "Verbindung wird aufgebaut",
    detail: "Gleich live.",
  },
  polling: {
    icon: WifiOffIcon,
    dot: "bg-warning",
    label: "Ersatzmodus",
    detail: "Keine Live-Verbindung. Die Seite fragt in Abständen nach.",
  },
} as const;

export function ConnectionDot() {
  const status = useRealtimeStatus();
  const state = STATES[status];
  const Icon = state.icon;

  return (
    <span
      // `title` and not a tooltip primitive: this sits in a wrapping header row,
      // and a popover anchored there would be the one element that reflows the bar.
      title={`${state.label} — ${state.detail}`}
      className="inline-flex items-center gap-1.5 rounded-full px-1.5 py-1 text-muted-foreground"
    >
      <Icon className="size-3.5" strokeWidth={1.5} aria-hidden />
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full transition-colors",
          state.dot,
          // Only while connecting. A pulse on the steady state is motion in the
          // corner of the eye for something that is not asking for attention.
          status === "connecting" && "animate-pulse",
        )}
      />
      {/* The only text a screen reader gets — the dot and the icon are decorative. */}
      <span className="sr-only">{state.label}</span>
    </span>
  );
}
