"use client";

import { Reorder, useDragControls } from "framer-motion";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  GripVerticalIcon,
  Loader2Icon,
  SaveIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { savePortalConfigAction } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  PORTAL_WIDGET_LABELS,
  type PortalConfig,
  type PortalWidgetKey,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Portal layout editor: hero texts, widget visibility, order and titles.

   Reordering is drag & drop via framer-motion's `Reorder`, which is already a
   dependency — @dnd-kit would be two more packages for the same interaction.
   `Reorder` has no keyboard support, so every row also carries up/down buttons.
   Without them the order would be unreachable without a pointer.
   ────────────────────────────────────────────────────────────────────────── */

export function PortalLayoutForm({ config }: { config: PortalConfig }) {
  const [heroTitle, setHeroTitle] = useState(config.hero_title);
  const [heroSubtitle, setHeroSubtitle] = useState(config.hero_subtitle);
  const [ticketLabel, setTicketLabel] = useState(config.ticket_button_label);
  const [order, setOrder] = useState<PortalWidgetKey[]>(config.widget_order);
  const [enabled, setEnabled] = useState(config.enabled_widgets);
  const [titles, setTitles] = useState(config.widget_titles);

  const [result, formAction, saving] = useActionState(
    savePortalConfigAction,
    null,
  );

  const move = (index: number, delta: number) =>
    setOrder((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const payload = {
    hero_title: heroTitle,
    hero_subtitle: heroSubtitle,
    ticket_button_label: ticketLabel,
    enabled_widgets: enabled,
    widget_titles: titles,
    widget_order: order,
  };

  return (
    <div className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Begrüßung & Texte</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            <code>{"{name}"}</code> wird durch den Vornamen der angemeldeten
            Person ersetzt — „Guten Tag, {"{name}"}!“ ergibt also eine
            persönliche Anrede. Ohne Platzhalter bleibt der Text für alle gleich.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="hero-title">Überschrift</Label>
            <Input
              id="hero-title"
              value={heroTitle}
              onChange={(event) => setHeroTitle(event.target.value)}
              disabled={saving}
              className="h-10 rounded-xl"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="hero-subtitle">Untertitel</Label>
            <Textarea
              id="hero-subtitle"
              value={heroSubtitle}
              onChange={(event) => setHeroSubtitle(event.target.value)}
              rows={2}
              disabled={saving}
              className="rounded-xl"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ticket-label">Beschriftung Ticket-Einstieg</Label>
            <Input
              id="ticket-label"
              value={ticketLabel}
              onChange={(event) => setTicketLabel(event.target.value)}
              disabled={saving}
              className="h-10 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Steht über den beiden Einstiegskacheln.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Widgets</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Ziehen zum Sortieren, oder die Pfeiltasten-Buttons benutzen.
            Ausgeschaltete Widgets verschwinden aus dem Portal, ihre Inhalte
            bleiben gespeichert. Ein Widget ohne Inhalt wird auch eingeschaltet
            nicht gezeigt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Reorder.Group
            axis="y"
            values={order}
            onReorder={setOrder}
            className="grid gap-2"
          >
            {order.map((key, index) => (
              <WidgetRow
                key={key}
                widget={key}
                index={index}
                total={order.length}
                enabled={enabled[key] ?? true}
                title={titles[key] ?? ""}
                disabled={saving}
                onToggle={(value) =>
                  setEnabled((current) => ({ ...current, [key]: value }))
                }
                onTitle={(value) =>
                  setTitles((current) => ({ ...current, [key]: value }))
                }
                onMove={(delta) => move(index, delta)}
              />
            ))}
          </Reorder.Group>
        </CardContent>
      </Card>

      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="config" value={JSON.stringify(payload)} />
        {result && (
          <Alert
            variant={result.ok ? "default" : "destructive"}
            className="rounded-2xl border-border px-4 py-3"
          >
            {result.ok ? (
              <CheckCircle2Icon strokeWidth={1.5} />
            ) : (
              <TriangleAlertIcon strokeWidth={1.5} />
            )}
            <AlertDescription>
              {result.ok ? result.message : result.error}
            </AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          className="h-11 w-fit rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          disabled={saving}
        >
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon strokeWidth={1.5} />}
          {saving ? "Speichern …" : "Layout speichern"}
        </Button>
      </form>
    </div>
  );
}

function WidgetRow({
  widget,
  index,
  total,
  enabled,
  title,
  disabled,
  onToggle,
  onTitle,
  onMove,
}: {
  widget: PortalWidgetKey;
  index: number;
  total: number;
  enabled: boolean;
  title: string;
  disabled: boolean;
  onToggle: (value: boolean) => void;
  onTitle: (value: string) => void;
  onMove: (delta: number) => void;
}) {
  // Drag starts on the handle only. With the whole row draggable, selecting text
  // in the title input would move the row instead.
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={widget}
      dragListener={false}
      dragControls={controls}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background px-3 py-2.5",
        !enabled && "opacity-60",
      )}
    >
      <button
        type="button"
        aria-label={`${PORTAL_WIDGET_LABELS[widget]} verschieben`}
        onPointerDown={(event) => controls.start(event)}
        className="cursor-grab touch-none rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-4" strokeWidth={1.5} />
      </button>

      <div className="min-w-40 flex-1">
        <span className="text-sm font-medium">
          {PORTAL_WIDGET_LABELS[widget]}
        </span>
        <span className="ml-2 text-xs text-muted-foreground">{widget}</span>
      </div>

      <Input
        value={title}
        onChange={(event) => onTitle(event.target.value)}
        placeholder="Überschrift im Portal"
        aria-label={`Überschrift für ${PORTAL_WIDGET_LABELS[widget]}`}
        disabled={disabled}
        className="h-9 min-w-52 flex-1 rounded-xl"
      />

      {/* The keyboard path. `Reorder` is pointer-only. */}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${PORTAL_WIDGET_LABELS[widget]} nach oben`}
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
          className="rounded-full"
        >
          <ArrowUpIcon strokeWidth={1.5} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${PORTAL_WIDGET_LABELS[widget]} nach unten`}
          disabled={disabled || index === total - 1}
          onClick={() => onMove(1)}
          className="rounded-full"
        >
          <ArrowDownIcon strokeWidth={1.5} />
        </Button>
      </div>

      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        disabled={disabled}
        aria-label={`${PORTAL_WIDGET_LABELS[widget]} anzeigen`}
      />
    </Reorder.Item>
  );
}
