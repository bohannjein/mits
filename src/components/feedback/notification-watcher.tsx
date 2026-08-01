"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useToast } from "@/components/feedback/toast";
import {
  channelConfig,
  type NotificationChannel,
  type NotificationSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Turns the notification feed into toasts.

   Renders nothing. Placed in the header so every page participates without each
   one having to know about notifications — the same arrangement `PresenceHeartbeat`
   uses, and for the same reason.

   **`since` advances only on a successful response.** Holding it in a ref that the
   effect writes after the data arrives means a failed poll re-asks for the same
   window rather than skipping it; advancing the cursor on the request would drop
   every event that happened during an outage, and nothing would ever say so.

   **A large batch becomes one digest.** Coming back from a meeting to twelve
   toasts is a wall somebody dismisses without reading, which is worse than not
   being told: it looks like they were informed. Past the admin's threshold the
   watcher asks `/api/notifications/digest` for a single summary instead. The
   events are re-derived server-side from the same cursor — what this component
   holds is never sent back to be summarised.
   ────────────────────────────────────────────────────────────────────────── */

interface FeedItem {
  key: string;
  kind: NotificationChannel;
  title: string;
  description: string;
  href: string;
  createdAt: string;
}

interface DigestAnswer {
  digest: { headline: string; summary: string; count: number } | null;
  latest?: string;
}

/*
 * Event keys already shown, at module scope rather than in a ref.
 *
 * `AppHeader` is rendered by each page, so every navigation unmounts this
 * component and mounts a fresh one — and TanStack hands the new instance the
 * cached `["notifications"]` result straight away. With the cursor living only in
 * a ref, that cache hit replayed the last batch as toasts on arrival at the next
 * page: click through to the ticket a notification pointed at, and it announced
 * itself again on the page it had just taken you to.
 *
 * A module-level set survives the remount, which is the point — it is scoped to
 * the tab, and a tab is exactly how long "I have already seen this" holds.
 * Bounded, because a long shift on one tab would otherwise grow it without limit.
 */
const shown = new Set<string>();
const MAX_REMEMBERED = 200;

function remember(key: string): boolean {
  if (shown.has(key)) return false;
  if (shown.size >= MAX_REMEMBERED) {
    // Oldest first — insertion order is guaranteed for a Set.
    shown.delete(shown.values().next().value as string);
  }
  shown.add(key);
  return true;
}

export function NotificationWatcher({
  settings,
}: {
  settings: NotificationSettings;
}) {
  // Mount time, so the first poll never replays the backlog. Somebody opening a
  // page should not be greeted by four toasts about things from before lunch.
  const since = useRef(new Date().toISOString());
  const { toast } = useToast();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<FeedItem[]> => {
      const response = await fetch(
        `/api/notifications?since=${encodeURIComponent(since.current)}`,
        { cache: "no-store" },
      );
      // A 401 after a session expires must not turn into a toast loop; the empty
      // list keeps the cursor where it is and the next page load redirects.
      if (!response.ok) return [];
      const body = (await response.json()) as { notifications?: FeedItem[] };
      return body.notifications ?? [];
    },
    refetchInterval: settings.pollSeconds * 1000,
    // Off in a hidden tab. TanStack pauses the interval, and the cursor stays
    // put — so the events that arrived meanwhile show up on the first poll after
    // the tab comes back rather than being lost.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    // The global default is 30 s, which is longer than most poll intervals and
    // would swallow exactly the refetch that fires when somebody returns to the tab.
    staleTime: 0,
    // Retries would stack requests against an instance that is already struggling;
    // the next interval is the retry.
    retry: false,
  });

  useEffect(() => {
    if (!data || data.length === 0) return;

    /*
     * Switched-off channels are dropped before anything else looks at the batch.
     *
     * Client-side, and that is fine here: this decides what is *shown*, not what
     * is sent. The scope rule that decides what a session may know about lives in
     * `listNotifications` and is unaffected by any of this.
     */
    const visible = data.filter(
      (item) => channelConfig(settings, item.kind).enabled,
    );
    if (visible.length === 0) {
      // The cursor still moves. Otherwise a muted channel's events come back on
      // every poll for as long as they are inside the lookback window.
      since.current = newestOf(data, since.current);
      return;
    }

    const fresh = visible.filter((item) => remember(item.key));
    if (fresh.length === 0) {
      since.current = newestOf(data, since.current);
      return;
    }

    const digesting =
      settings.digestThreshold > 0 && fresh.length >= settings.digestThreshold;

    if (!digesting) {
      for (const item of fresh) {
        const channel = channelConfig(settings, item.kind);
        toast({
          key: item.key,
          kind: item.kind,
          tone: channel.tone,
          // `0` is the admin's "stays until dismissed" for this channel.
          seconds: channel.sticky ? 0 : undefined,
          title: item.title,
          description: item.description,
          href: item.href,
        });
      }
      since.current = newestOf(data, since.current);
      return;
    }

    /*
     * The digest is asked for with the cursor as it was *before* this batch, so
     * the server rebuilds the same window rather than a narrower one. The cursor
     * advances on the answer — or on the batch itself if the request fails, which
     * is the important half: a failed digest must not mean the same twelve events
     * come back and try again on the next poll.
     */
    const from = since.current;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/notifications/digest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ since: from }),
          cache: "no-store",
        });
        if (cancelled) return;
        const body = response.ok ? ((await response.json()) as DigestAnswer) : null;

        if (body?.digest) {
          toast({
            key: `digest:${from}`,
            kind: "digest",
            tone: "info",
            // Always stays. It replaced a stack of individual messages, so five
            // seconds to read a summary of twelve events is the same failure the
            // digest exists to fix.
            seconds: 0,
            title: body.digest.headline,
            description: body.digest.summary,
          });
          since.current = body.latest ?? newestOf(data, from);
          return;
        }
      } catch {
        // Fall through to the individual toasts below.
      }
      if (cancelled) return;

      // No digest — the module is off, or the request failed. Say it the plain
      // way rather than not at all.
      for (const item of fresh) {
        const channel = channelConfig(settings, item.kind);
        toast({
          key: item.key,
          kind: item.kind,
          tone: channel.tone,
          seconds: channel.sticky ? 0 : undefined,
          title: item.title,
          description: item.description,
          href: item.href,
        });
      }
      since.current = newestOf(data, from);
    })();

    return () => {
      cancelled = true;
    };
  }, [data, toast, settings]);

  return null;
}

/**
 * Advance past the newest event just handled, not to "now".
 *
 * `Date.now()` here would skip anything written between the server building the
 * response and the client processing it — a narrow window, but one that silently
 * drops a reply and leaves no trace that it did.
 */
function newestOf(items: FeedItem[], fallback: string): string {
  return items.reduce(
    (latest, item) => (item.createdAt > latest ? item.createdAt : latest),
    fallback,
  );
}
