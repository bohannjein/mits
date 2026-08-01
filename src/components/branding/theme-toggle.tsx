"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   Theme switch.

   Three choices, not two. A bare dark/light toggle cannot express "follow my
   laptop", and an account that wants that has nowhere else to say so — the
   preference lives in `localStorage`, not in `mits_setting`, because it is a
   property of this browser rather than of the person.

   Two shapes from one component: `variant="menu"` for the header, where space is
   a row of pills, and `variant="segmented"` for the settings page, where the
   three options should be visible without opening anything.
   ────────────────────────────────────────────────────────────────────────── */

type ThemeChoice = "light" | "dark" | "system";

const CHOICES: {
  value: ThemeChoice;
  label: string;
  icon: typeof SunIcon;
}[] = [
  { value: "light", label: "Hell", icon: SunIcon },
  { value: "dark", label: "Dunkel", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
];

/**
 * Whether the client has taken over.
 *
 * Before hydration there is no way to know which theme is active: the value comes
 * from `localStorage`, which the server cannot read. Rendering the resolved icon
 * straight away would mean the server picks one and the client corrects it — a
 * hydration mismatch on every page for a purely decorative glyph. The neutral
 * monitor icon is shown until then.
 */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function ThemeToggle({
  variant = "menu",
  className,
}: {
  variant?: "menu" | "segmented";
  className?: string;
}) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  // `theme` is the *choice* ("system" stays "system"); `resolvedTheme` is what it
  // currently means. The icon follows the resolution, the checkmark follows the
  // choice — otherwise picking "System" on a light laptop would tick "Hell".
  const active: ThemeChoice = mounted ? ((theme as ThemeChoice) ?? "dark") : "system";
  const Icon = mounted
    ? resolvedTheme === "light"
      ? SunIcon
      : MoonIcon
    : MonitorIcon;

  if (variant === "segmented") {
    return (
      <div
        role="group"
        aria-label="Erscheinungsbild"
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated p-1",
          className,
        )}
      >
        {CHOICES.map((choice) => {
          const selected = active === choice.value;
          return (
            <Button
              key={choice.value}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={selected}
              onClick={() => setTheme(choice.value)}
              className={cn(
                "h-8 rounded-full px-3 text-xs",
                // The selected pill carries the inverse surface, which is legible
                // in both themes by construction; the rest keep `--foreground` and
                // only move their background on hover.
                selected
                  ? "bg-inverse-surface text-inverse-surface-foreground hover:bg-inverse-surface-hover hover:text-inverse-surface-foreground"
                  : "text-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <choice.icon strokeWidth={1.5} />
              {choice.label}
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Erscheinungsbild wechseln"
          className={cn("size-9 rounded-full p-0", className)}
        >
          <Icon strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44 rounded-2xl border border-border shadow-elev-2"
      >
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Erscheinungsbild
        </DropdownMenuLabel>
        {CHOICES.map((choice) => (
          <DropdownMenuItem
            key={choice.value}
            onSelect={() => setTheme(choice.value)}
            className="rounded-xl"
          >
            <choice.icon strokeWidth={1.5} />
            {choice.label}
            {active === choice.value && (
              <span
                aria-hidden
                className="ml-auto size-1.5 rounded-full bg-primary"
              />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
