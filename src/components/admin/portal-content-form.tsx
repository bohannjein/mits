"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { savePortalContentAction } from "@/app/admin/actions";
import { AnnouncementBanner } from "@/components/dashboard/announcement-banner";
import { ResourceGrid } from "@/components/dashboard/resource-grid";
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
import { ICON_NAMES } from "@/lib/icons";
import {
  isSafeResourceHref,
  type Announcement,
  type AnnouncementLevel,
  type PortalContent,
  type PortalResource,
  type ResourceKind,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Portal editor: the banner messages and the quick-access tiles.

   Both lists render their real components below the form, so an admin sees the
   banner exactly as the portal will show it before saving.
   ────────────────────────────────────────────────────────────────────────── */

const LEVELS: { value: AnnouncementLevel; label: string }[] = [
  { value: "info", label: "Information" },
  { value: "warning", label: "Warnung" },
  { value: "critical", label: "Störung" },
];

const KINDS: { value: ResourceKind; label: string }[] = [
  { value: "link", label: "Link öffnen" },
  { value: "download", label: "Download" },
];

export function PortalContentForm({ content }: { content: PortalContent }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(
    content.announcements,
  );
  const [resources, setResources] = useState<PortalResource[]>(content.resources);
  const [result, formAction, saving] = useActionState(
    savePortalContentAction,
    null,
  );

  // Ids only need to be unique within the list; the crypto API is available in
  // every browser this app supports.
  const newId = () => crypto.randomUUID();

  const patchAnnouncement = (id: string, patch: Partial<Announcement>) =>
    setAnnouncements((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );

  const patchResource = (id: string, patch: Partial<PortalResource>) =>
    setResources((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );

  const invalidHrefs = resources.filter(
    (resource) => resource.href.trim() !== "" && !isSafeResourceHref(resource.href),
  );

  return (
    <div className="grid gap-6">
      <Card className="rounded-sm border-2 border-border ring-0">
        <CardHeader>
          <CardTitle className="uppercase">Systemmeldungen</CardTitle>
          <CardDescription>
            Erscheinen als Banner über dem Portal und über dem Ticket-Eingang.
            Ausgeschaltete Meldungen bleiben gespeichert, ohne angezeigt zu werden.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {announcements.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Keine Meldungen — das Portal zeigt dann kein Banner.
            </p>
          )}

          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              className="grid gap-3 rounded-sm border-2 border-border p-3"
            >
              <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
                <div className="grid gap-2">
                  <Label htmlFor={`title-${announcement.id}`}>Titel</Label>
                  <Input
                    id={`title-${announcement.id}`}
                    value={announcement.title}
                    placeholder="z. B. Wartung am Samstag"
                    className="rounded-sm"
                    onChange={(event) =>
                      patchAnnouncement(announcement.id, { title: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Stufe</Label>
                  <Select
                    value={announcement.type}
                    onValueChange={(value) =>
                      patchAnnouncement(announcement.id, {
                        type: value as AnnouncementLevel,
                      })
                    }
                  >
                    <SelectTrigger className="h-9 w-full rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`message-${announcement.id}`}>Text</Label>
                <Textarea
                  id={`message-${announcement.id}`}
                  rows={3}
                  value={announcement.message}
                  className="rounded-sm"
                  onChange={(event) =>
                    patchAnnouncement(announcement.id, { message: event.target.value })
                  }
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Switch
                    id={`active-${announcement.id}`}
                    checked={announcement.active}
                    onCheckedChange={(checked) =>
                      patchAnnouncement(announcement.id, { active: checked === true })
                    }
                  />
                  <Label htmlFor={`active-${announcement.id}`}>Sichtbar</Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-sm"
                  onClick={() =>
                    setAnnouncements((current) =>
                      current.filter((entry) => entry.id !== announcement.id),
                    )
                  }
                >
                  <Trash2Icon />
                  Entfernen
                </Button>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            className="w-fit rounded-sm"
            onClick={() =>
              setAnnouncements((current) => [
                ...current,
                {
                  id: newId(),
                  title: "",
                  message: "",
                  type: "info",
                  active: true,
                },
              ])
            }
          >
            <PlusIcon />
            Meldung hinzufügen
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-sm border-2 border-border ring-0">
        <CardHeader>
          <CardTitle className="uppercase">Schnellzugriffe</CardTitle>
          <CardDescription>
            Kacheln für Downloads und Anleitungen. Ziel muss <code>http</code>,{" "}
            <code>https</code> oder ein Pfad wie <code>/api/uploads/…</code> sein.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {resources.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Keine Kacheln — der Bereich bleibt dann ausgeblendet.
            </p>
          )}

          {resources.map((resource) => {
            const hrefBad =
              resource.href.trim() !== "" && !isSafeResourceHref(resource.href);

            return (
              <div
                key={resource.id}
                className="grid gap-3 rounded-sm border-2 border-border p-3"
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_10rem_12rem]">
                  <div className="grid gap-2">
                    <Label htmlFor={`label-${resource.id}`}>Beschriftung</Label>
                    <Input
                      id={`label-${resource.id}`}
                      value={resource.label}
                      placeholder="z. B. TeamViewer QuickSupport"
                      className="rounded-sm"
                      onChange={(event) =>
                        patchResource(resource.id, { label: event.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Art</Label>
                    <Select
                      value={resource.kind}
                      onValueChange={(value) =>
                        patchResource(resource.id, { kind: value as ResourceKind })
                      }
                    >
                      <SelectTrigger className="h-9 w-full rounded-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KINDS.map((kind) => (
                          <SelectItem key={kind.value} value={kind.value}>
                            {kind.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Icon</Label>
                    <Select
                      value={resource.icon}
                      onValueChange={(icon) => patchResource(resource.id, { icon })}
                    >
                      <SelectTrigger className="h-9 w-full rounded-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_NAMES.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`href-${resource.id}`}>Ziel</Label>
                  <Input
                    id={`href-${resource.id}`}
                    value={resource.href}
                    placeholder="https://get.teamviewer.com/…"
                    className="rounded-sm font-mono"
                    aria-invalid={hrefBad}
                    onChange={(event) =>
                      patchResource(resource.id, { href: event.target.value })
                    }
                  />
                  {hrefBad && (
                    <p className="text-xs font-medium text-destructive">
                      Nur http, https oder ein Pfad, der mit / beginnt.
                    </p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`desc-${resource.id}`}>Beschreibung</Label>
                  <Input
                    id={`desc-${resource.id}`}
                    value={resource.description}
                    className="rounded-sm"
                    onChange={(event) =>
                      patchResource(resource.id, { description: event.target.value })
                    }
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit rounded-sm"
                  onClick={() =>
                    setResources((current) =>
                      current.filter((entry) => entry.id !== resource.id),
                    )
                  }
                >
                  <Trash2Icon />
                  Entfernen
                </Button>
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            className="w-fit rounded-sm"
            onClick={() =>
              setResources((current) => [
                ...current,
                {
                  id: newId(),
                  label: "",
                  description: "",
                  href: "",
                  kind: "link",
                  icon: "ExternalLink",
                },
              ])
            }
          >
            <PlusIcon />
            Kachel hinzufügen
          </Button>
        </CardContent>
      </Card>

      <form action={formAction} className="grid gap-3">
        <input
          type="hidden"
          name="content"
          value={JSON.stringify({ announcements, resources })}
        />
        {result && (
          <Alert
            variant={result.ok ? "default" : "destructive"}
            className="rounded-sm border-2"
          >
            {result.ok ? <CheckCircle2Icon /> : <TriangleAlertIcon />}
            <AlertDescription>
              {result.ok ? result.message : result.error}
            </AlertDescription>
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          className="w-fit rounded-sm"
          disabled={saving || invalidHrefs.length > 0}
        >
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          {saving ? "Speichern …" : "Portal speichern"}
        </Button>
      </form>

      <Separator className="bg-border" />

      {/* Rendered with the real portal components, not a mock-up. */}
      <div className="grid gap-5">
        <span className="label-industrial">Vorschau</span>
        <AnnouncementBanner
          announcements={announcements.filter((entry) => entry.active)}
        />
        <ResourceGrid resources={resources} />
      </div>
    </div>
  );
}
