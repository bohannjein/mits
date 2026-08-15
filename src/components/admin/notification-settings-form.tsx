"use client";

import {
  BellIcon,
  BellOffIcon,
  CheckCircle2Icon,
  Loader2Icon,
  SaveIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState } from "react";

import { saveNotificationSettingsAction } from "@/app/admin/actions";
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
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_META,
  TOAST_POSITIONS,
  TOAST_POSITION_LABELS,
  TOAST_TONE_LABELS,
  channelConfig,
  type NotificationSettings,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Notification channels, the way a phone does them.

   One form, submitted whole — the mail and analytics masks document why: an
   unchecked switch is not posted, so two forms would have each save read the
   other's switches as off.

   The preview is a real toast rendered inline rather than a description of one.
   Position, dwell time and tone are three settings whose effect is obvious when
   seen and hard to picture from a dropdown label.
   ────────────────────────────────────────────────────────────────────────── */

export function NotificationSettingsForm({
  settings,
  /** Whether the AI digest is switched on, so the mask can say what will happen. */
  digestUsesModel,
  /**
   * Ob Beobachter überhaupt existieren.
   *
   * Die engere Reichweite fragt nach „zugewiesen oder beobachtet"; ohne das
   * Modul gäbe es keine Abos, und die Einstellung wäre eine Stummschaltung ohne
   * Ausgang. Deshalb erscheint sie nur mit ihm.
   */
  watchersOn = false,
}: {
  settings: NotificationSettings;
  digestUsesModel: boolean;
  watchersOn?: boolean;
}) {
  const [result, action, saving] = useActionState(
    saveNotificationSettingsAction,
    null,
  );

  return (
    <form action={action} className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <BellIcon className="size-5 text-primary" aria-hidden strokeWidth={1.5} />
          <CardTitle className="mt-4 text-lg font-medium">Darstellung</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Gilt für alle Konten dieser Instanz.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="position">Ecke</Label>
              <Select
                name="position"
                defaultValue={settings.position}
                disabled={saving}
              >
                <SelectTrigger id="position" className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOAST_POSITIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {TOAST_POSITION_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="seconds">Anzeigedauer (Sekunden)</Label>
              <Input
                id="seconds"
                name="seconds"
                type="number"
                min={2}
                max={60}
                defaultValue={settings.seconds}
                disabled={saving}
                className="h-10 rounded-xl"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="maxVisible">Höchstens gleichzeitig</Label>
              <Input
                id="maxVisible"
                name="maxVisible"
                type="number"
                min={1}
                max={8}
                defaultValue={settings.maxVisible}
                disabled={saving}
                className="h-10 rounded-xl"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pollSeconds">Abfrageintervall (Sekunden)</Label>
              <Input
                id="pollSeconds"
                name="pollSeconds"
                type="number"
                min={5}
                max={300}
                defaultValue={settings.pollSeconds}
                disabled={saving}
                className="h-10 rounded-xl"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <BellOffIcon
            className="size-5 text-primary"
            aria-hidden
            strokeWidth={1.5}
          />
          <CardTitle className="mt-4 text-lg font-medium">Kanäle</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Ein stummer Kanal wird weiterhin abgefragt, aber nicht eingeblendet —
            im Ticket steht das Ereignis in jedem Fall.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          {NOTIFICATION_CHANNELS.map((channel) => {
            const config = channelConfig(settings, channel);
            const meta = NOTIFICATION_CHANNEL_META[channel];

            return (
              <div
                key={channel}
                className="grid gap-4 rounded-2xl border border-border p-4"
              >
                <div className="flex items-start gap-3">
                  <Switch
                    id={`${channel}_enabled`}
                    name={`${channel}_enabled`}
                    defaultChecked={config.enabled}
                    disabled={saving}
                  />
                  <div className="grid gap-1">
                    <Label htmlFor={`${channel}_enabled`} className="font-normal">
                      {meta.label}
                    </Label>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {meta.description}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 pl-11 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label
                      htmlFor={`${channel}_tone`}
                      className="text-xs text-muted-foreground"
                    >
                      Farbakzent
                    </Label>
                    <Select
                      name={`${channel}_tone`}
                      defaultValue={config.tone}
                      disabled={saving}
                    >
                      <SelectTrigger
                        id={`${channel}_tone`}
                        className="h-10 w-full rounded-xl"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.keys(TOAST_TONE_LABELS) as (keyof typeof TOAST_TONE_LABELS)[]
                        ).map((tone) => (
                          <SelectItem key={tone} value={tone}>
                            {TOAST_TONE_LABELS[tone]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-start gap-3 sm:pt-6">
                    <Switch
                      id={`${channel}_sticky`}
                      name={`${channel}_sticky`}
                      defaultChecked={config.sticky}
                      disabled={saving}
                    />
                    <Label
                      htmlFor={`${channel}_sticky`}
                      className="font-normal text-xs leading-relaxed text-muted-foreground"
                    >
                      Bleibt stehen, bis sie weggeklickt wird
                    </Label>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/*
        Die Reichweite des lautesten Kanals.

        Sie steht in einer eigenen Karte und nicht als dritter Schalter am Kanal
        „Neue Antwort": die drei dort beschreiben, *wie* eine Meldung aussieht,
        das hier entscheidet, *ob* es sie gibt. Zusammengelegt läse es sich als
        Darstellungsoption.

        Nur mit dem Modul, weil die engere Wahl nach Abos fragt, die es ohne das
        Modul nicht gibt.
      */}
      {watchersOn && (
        <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
          <CardHeader>
            <CardTitle className="text-lg font-medium">
              Reichweite der Antwort-Meldungen
            </CardTitle>
            <CardDescription className="mt-1 leading-relaxed">
              Ein Agent sieht jedes Ticket. Diese Einstellung entscheidet, über
              welche davon er auch etwas gesagt bekommt.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Label htmlFor="reply_scope">Melden bei Antworten auf</Label>
            <Select
              name="reply_scope"
              defaultValue={settings.reply_scope}
              disabled={saving}
            >
              <SelectTrigger
                id="reply_scope"
                className="h-10 w-full rounded-xl sm:w-80"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Tickets</SelectItem>
                <SelectItem value="mine">
                  Zugewiesene, beobachtete und eigene
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Wer ein Ticket übernimmt, darauf antwortet oder darin genannt wird,
              folgt ihm danach automatisch.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <SparklesIcon
            className="size-5 text-primary"
            aria-hidden
            strokeWidth={1.5}
          />
          <CardTitle className="mt-4 text-lg font-medium">Sammelmeldung</CardTitle>
          <CardDescription className="mt-1 leading-relaxed">
            Kommen mehrere Benachrichtigungen auf einmal an, erscheint statt des
            Stapels eine Meldung darüber, was in der Zwischenzeit passiert ist.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="digestThreshold">Ab wie vielen auf einmal</Label>
            <Input
              id="digestThreshold"
              placeholder="0 = aus"
              name="digestThreshold"
              type="number"
              min={0}
              max={50}
              defaultValue={settings.digestThreshold}
              disabled={saving}
              className="h-10 w-full rounded-xl sm:w-40"
            />
          </div>

          {/*
            Says which of the two texts a reader will get, because the difference
            is not visible from this page: the counting version is always there,
            the model only rewrites it.
          */}
          <Alert className="rounded-2xl border-border px-4 py-3">
            {digestUsesModel ? (
              <SparklesIcon strokeWidth={1.5} />
            ) : (
              <TriangleAlertIcon strokeWidth={1.5} />
            )}
            <AlertDescription className="text-xs leading-relaxed">
              {digestUsesModel
                ? "Die Sammelmeldung wird vom Modell formuliert. Übertragen werden Titel und Vorschauzeile der Benachrichtigungen, keine Ticketinhalte."
                : "Die Sammelmeldung zählt die Ereignisse und nennt die ersten drei. Für einen formulierten Text unter /admin/settings/ai die Sammelmeldung einschalten — nötig ist das nicht."}
            </AlertDescription>
          </Alert>

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
            {saving ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SaveIcon strokeWidth={1.5} />
            )}
            {saving ? "Speichern …" : "Speichern"}
          </Button>
        </CardContent>
      </Card>

      <Separator className="bg-border" />
    </form>
  );
}
