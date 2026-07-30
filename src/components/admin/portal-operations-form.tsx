"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { savePortalOperationsAction } from "@/app/admin/actions";
import { MaintenanceNotice } from "@/components/dashboard/maintenance-notice";
import { ServiceStatus } from "@/components/dashboard/service-status";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  SERVICE_STATE_LABELS,
  ServiceState,
  type PortalMaintenance,
  type PortalService,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Operations editor: which services are up, and what is scheduled.

   Both lists feed a portal widget that renders nothing while it is empty, so an
   admin who never fills these in simply never sees the blocks — no placeholder
   to explain away.
   ────────────────────────────────────────────────────────────────────────── */

const STATES = ServiceState.options.map((value) => ({
  value,
  label: SERVICE_STATE_LABELS[value],
}));

export function PortalOperationsForm({
  services: initialServices,
  maintenance: initialMaintenance,
}: {
  services: PortalService[];
  maintenance: PortalMaintenance[];
}) {
  const [services, setServices] = useState<PortalService[]>(initialServices);
  const [maintenance, setMaintenance] =
    useState<PortalMaintenance[]>(initialMaintenance);
  const [result, formAction, saving] = useActionState(
    savePortalOperationsAction,
    null,
  );

  const patchService = (id: string, patch: Partial<PortalService>) =>
    setServices((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );

  const patchNotice = (id: string, patch: Partial<PortalMaintenance>) =>
    setMaintenance((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );

  const moveService = (index: number, delta: number) =>
    setServices((current) => swap(current, index, delta));

  const incomplete =
    services.filter((service) => !service.label.trim()).length +
    maintenance.filter((notice) => !notice.title.trim()).length;

  return (
    <div className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Systemstatus</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Die Dienste, deren Zustand das Portal anzeigt. Reihenfolge wie hier.
            Ohne Eintrag bleibt das Widget unsichtbar, auch wenn es
            eingeschaltet ist.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {services.map((service, index) => (
            <div
              key={service.id}
              className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
            >
              <div className="grid gap-2">
                <Label htmlFor={`svc-label-${service.id}`}>Dienst</Label>
                <Input
                  id={`svc-label-${service.id}`}
                  value={service.label}
                  onChange={(event) =>
                    patchService(service.id, { label: event.target.value })
                  }
                  placeholder="z. B. Exchange / Mail"
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`svc-state-${service.id}`}>Zustand</Label>
                <Select
                  value={service.state}
                  onValueChange={(value) =>
                    patchService(service.id, {
                      state: value as PortalService["state"],
                    })
                  }
                  disabled={saving}
                >
                  <SelectTrigger
                    id={`svc-state-${service.id}`}
                    className="h-10 w-full rounded-xl"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATES.map((state) => (
                      <SelectItem key={state.value} value={state.value}>
                        {state.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Nach oben"
                  disabled={saving || index === 0}
                  onClick={() => moveService(index, -1)}
                  className="rounded-full"
                >
                  <ArrowUpIcon strokeWidth={1.5} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Nach unten"
                  disabled={saving || index === services.length - 1}
                  onClick={() => moveService(index, 1)}
                  className="rounded-full"
                >
                  <ArrowDownIcon strokeWidth={1.5} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`„${service.label || "Dienst"}“ entfernen`}
                  disabled={saving}
                  onClick={() =>
                    setServices((current) =>
                      current.filter((entry) => entry.id !== service.id),
                    )
                  }
                  className="rounded-full"
                >
                  <Trash2Icon strokeWidth={1.5} />
                </Button>
              </div>

              <div className="grid gap-2 sm:col-span-3">
                <Label htmlFor={`svc-note-${service.id}`}>
                  Zusatz (optional)
                </Label>
                <Input
                  id={`svc-note-${service.id}`}
                  value={service.note}
                  onChange={(event) =>
                    patchService(service.id, { note: event.target.value })
                  }
                  placeholder="z. B. Anmeldung verzögert"
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
          ))}

          <Button
            type="button"
            className="w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            disabled={saving}
            onClick={() =>
              setServices((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  label: "",
                  state: "operational",
                  note: "",
                },
              ])
            }
          >
            <PlusIcon strokeWidth={1.5} />
            Dienst hinzufügen
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Geplante Wartung</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Angekündigte Fenster. Das Zeitfenster ist Freitext — „Sa 02.08.,
            20:00–23:00 Uhr“ liest sich besser als ein Datumsfeld. Ausgeschaltete
            Einträge bleiben für ein wiederkehrendes Fenster gespeichert.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {maintenance.map((notice) => (
            <div
              key={notice.id}
              className="grid gap-3 rounded-2xl border border-border p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Switch
                    id={`mnt-active-${notice.id}`}
                    checked={notice.active}
                    onCheckedChange={(value) =>
                      patchNotice(notice.id, { active: value })
                    }
                    disabled={saving}
                  />
                  <Label htmlFor={`mnt-active-${notice.id}`}>Sichtbar</Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`„${notice.title || "Wartung"}“ entfernen`}
                  disabled={saving}
                  onClick={() =>
                    setMaintenance((current) =>
                      current.filter((entry) => entry.id !== notice.id),
                    )
                  }
                  className="rounded-full"
                >
                  <Trash2Icon strokeWidth={1.5} />
                </Button>
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`mnt-title-${notice.id}`}>Titel</Label>
                <Input
                  id={`mnt-title-${notice.id}`}
                  value={notice.title}
                  onChange={(event) =>
                    patchNotice(notice.id, { title: event.target.value })
                  }
                  placeholder="z. B. Firewall-Update"
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`mnt-window-${notice.id}`}>Zeitfenster</Label>
                <Input
                  id={`mnt-window-${notice.id}`}
                  value={notice.window}
                  onChange={(event) =>
                    patchNotice(notice.id, { window: event.target.value })
                  }
                  placeholder="Sa 02.08., 20:00–23:00 Uhr"
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`mnt-note-${notice.id}`}>Hinweis</Label>
                <Textarea
                  id={`mnt-note-${notice.id}`}
                  value={notice.note}
                  onChange={(event) =>
                    patchNotice(notice.id, { note: event.target.value })
                  }
                  rows={2}
                  placeholder="Was in dieser Zeit nicht erreichbar ist."
                  disabled={saving}
                  className="rounded-xl"
                />
              </div>
            </div>
          ))}

          <Button
            type="button"
            className="w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
            disabled={saving}
            onClick={() =>
              setMaintenance((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  title: "",
                  window: "",
                  note: "",
                  active: true,
                },
              ])
            }
          >
            <PlusIcon strokeWidth={1.5} />
            Wartung hinzufügen
          </Button>
        </CardContent>
      </Card>

      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="services" value={JSON.stringify(services)} />
        <input
          type="hidden"
          name="maintenance"
          value={JSON.stringify(maintenance)}
        />
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
        {incomplete > 0 && (
          <Alert
            variant="destructive"
            className="rounded-2xl border-border px-4 py-3"
          >
            <TriangleAlertIcon strokeWidth={1.5} />
            <AlertDescription>
              {incomplete} Eintrag/Einträge ohne Bezeichnung. Bitte ausfüllen oder
              entfernen.
            </AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          className="h-11 w-fit rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          disabled={saving || incomplete > 0}
        >
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon strokeWidth={1.5} />}
          {saving ? "Speichern …" : "Betrieb speichern"}
        </Button>
      </form>

      <Separator className="bg-border" />

      <div className="grid gap-5">
        <span className="label-industrial">Vorschau</span>
        <ServiceStatus
          title="Systemstatus"
          services={services.filter((service) => service.label.trim())}
        />
        <MaintenanceNotice
          title="Geplante Wartung"
          notices={maintenance.filter(
            (notice) => notice.active && notice.title.trim(),
          )}
        />
      </div>
    </div>
  );
}

function swap<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
