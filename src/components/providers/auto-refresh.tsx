"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/* ──────────────────────────────────────────────────────────────────────────
   Periodic refresh.

   `router.refresh()` rather than a reload: it re-runs the server components and
   swaps in the new RSC payload, so client state survives — an open dialog stays
   open, a half-typed reply stays typed, and the scroll position holds. A reload
   would fetch the document, the JS and the CSS again and throw all of that away.

   Three things keep the cost down, and they matter more than the interval does:

   - **A hidden tab does not poll.** Left alone, a dashboard forgotten on a second
     monitor would refresh all day. The timer stops on `visibilitychange` and, if a
     tick was missed while away, refreshes once on return — so coming back shows
     current data immediately instead of after another full interval.
   - **Offline does not poll.** A failed refresh is not a cheaper refresh.
   - **A refresh already in flight is not queued behind another.** On a slow
     connection a short interval would otherwise stack requests faster than they
     complete.

   The interval lives in `localStorage`, not in the database. It is a per-device
   comfort setting — the number that suits a wall-mounted queue display is not the
   one that suits a laptop — and storing it server-side would mean a write and a
   round trip for something no other device needs to know.
   ────────────────────────────────────────────────────────────────────────── */

/** Minutes. `0` is off. */
export const REFRESH_INTERVALS = [0, 1, 3, 5, 10] as const;
export type RefreshInterval = (typeof REFRESH_INTERVALS)[number];

export const DEFAULT_REFRESH_MINUTES: RefreshInterval = 3;

const STORAGE_KEY = "mits.refresh-minutes";

export const REFRESH_LABELS: Record<RefreshInterval, string> = {
  0: "Aus",
  1: "1 Minute",
  3: "3 Minuten",
  5: "5 Minuten",
  10: "10 Minuten",
};

/** Short form for the header trigger, where space is tight. */
export const REFRESH_SHORT_LABELS: Record<RefreshInterval, string> = {
  0: "Aus",
  1: "1 min",
  3: "3 min",
  5: "5 min",
  10: "10 min",
};

interface AutoRefreshState {
  minutes: RefreshInterval;
  setMinutes: (value: RefreshInterval) => void;
  /** True while a refresh is in flight, for the control's spinner. */
  refreshing: boolean;
  refreshNow: () => void;
}

const AutoRefreshContext = createContext<AutoRefreshState>({
  minutes: DEFAULT_REFRESH_MINUTES,
  setMinutes: () => {},
  refreshing: false,
  refreshNow: () => {},
});

const isRefreshInterval = (value: unknown): value is RefreshInterval =>
  typeof value === "number" &&
  (REFRESH_INTERVALS as readonly number[]).includes(value);

export function AutoRefreshProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  /*
   * Starts at the default rather than reading storage during render: there is no
   * `localStorage` on the server, so reading it in the initial state would make the
   * client's first render disagree with the server's. The effect below adopts the
   * stored value on mount.
   */
  const [minutes, setMinutesState] = useState<RefreshInterval>(
    DEFAULT_REFRESH_MINUTES,
  );
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return;
    const parsed = Number(stored);
    if (isRefreshInterval(parsed)) setMinutesState(parsed);
  }, []);

  const setMinutes = useCallback((value: RefreshInterval) => {
    setMinutesState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Private mode or a full quota. The setting still applies to this session;
      // failing to remember it is not worth an error message.
    }
  }, []);

  const refreshNow = useCallback(() => {
    setRefreshing(true);
    router.refresh();
    /*
     * `router.refresh()` gives no completion signal, so the flag is cleared on a
     * short timer. It drives a spinner and nothing else — the alternative is a
     * transition wrapper whose pending state also covers unrelated navigations, and
     * a spinner that lights up when somebody clicks a link is worse than one that
     * is slightly imprecise about when it stops.
     */
    const timer = setTimeout(() => setRefreshing(false), 600);
    return () => clearTimeout(timer);
  }, [router]);

  useEffect(() => {
    if (minutes === 0) return;

    const period = minutes * 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Tracked rather than read back from the DOM so a tick that arrives during an
    // in-flight refresh can be dropped instead of queued behind it.
    let inFlight = false;
    let lastRun = Date.now();

    const run = () => {
      lastRun = Date.now();
      inFlight = true;
      router.refresh();
      setRefreshing(true);
      setTimeout(() => {
        inFlight = false;
        setRefreshing(false);
      }, 600);
    };

    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(tick, Math.max(1000, delay));
    };

    const tick = () => {
      if (document.hidden || !navigator.onLine || inFlight) {
        // Not skipped forever — re-armed for one more period, and the visibility
        // handler below catches up the moment the tab comes back.
        schedule(period);
        return;
      }
      run();
      schedule(period);
    };

    const onVisible = () => {
      if (document.hidden) {
        clearTimeout(timer);
        return;
      }
      // A tab that was away longer than the interval is stale, so it refreshes at
      // once rather than showing old data for another full period.
      const elapsed = Date.now() - lastRun;
      if (elapsed >= period) {
        run();
        schedule(period);
      } else {
        schedule(period - elapsed);
      }
    };

    schedule(period);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [minutes, router]);

  return (
    <AutoRefreshContext.Provider
      value={{ minutes, setMinutes, refreshing, refreshNow }}
    >
      {children}
    </AutoRefreshContext.Provider>
  );
}

export const useAutoRefresh = (): AutoRefreshState =>
  useContext(AutoRefreshContext);
