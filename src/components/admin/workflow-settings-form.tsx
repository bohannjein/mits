"use client";

import { CheckCircle2Icon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { useActionState } from "react";

import { saveWorkflowSettingsAction } from "@/app/admin/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AUTO_CLOSE_DAY_CHOICES,
  type WorkflowSettings,
} from "@/types/mits";

/**
 * Ein `<select>` und kein Zahlenfeld — dieselbe Begründung wie bei der
 * Sitzungsdauer: der Wert entscheidet, wann Kundentickets zugehen, und eine
 * getippte `1` neben einer gemeinten `10` ist ein Bestand, der über Nacht
 * verschwindet.
 */
function DayPicker({
  name,
  label,
  value,
  disabled,
}: {
  name: string;
  label: string;
  value: number;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Select name={name} defaultValue={String(value)} disabled={disabled}>
        <SelectTrigger id={name} className="h-10 rounded-xl">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AUTO_CLOSE_DAY_CHOICES.map((days) => (
            <SelectItem key={days} value={String(days)}>
              {days === 0 ? "Aus" : `${days} Tage`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function WorkflowSettingsForm({
  settings,
}: {
  settings: WorkflowSettings;
}) {
  const [result, formAction, pending] = useActionState(
    saveWorkflowSettingsAction,
    null,
  );

  return (
    <form action={formAction} className="grid gap-6">
      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Beim Antworten</CardTitle>
          <CardDescription>
            Was eine öffentliche Antwort am Ticket bewegt. Interne Notizen bleiben
            folgenlos.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="flex items-start gap-3 rounded-2xl border border-border p-4">
            <Switch
              id="claimOnReply"
              name="claimOnReply"
              defaultChecked={settings.claimOnReply}
              disabled={pending}
            />
            <div className="grid gap-1">
              <Label htmlFor="claimOnReply">
                Antwort übernimmt das Ticket
              </Label>
              {/* Was der Schalter tut, ist nicht aus seiner Beschriftung
                  ableitbar — die Einschränkung „nur wenn frei" ist die halbe
                  Regel und der Grund, warum niemandem etwas weggenommen wird. */}
              <p className="text-sm text-muted-foreground">
                Nur wenn noch niemand zugewiesen ist.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-border p-4">
            <Switch
              id="statusFollowsReply"
              name="statusFollowsReply"
              defaultChecked={settings.statusFollowsReply}
              disabled={pending}
            />
            <div className="grid gap-1">
              <Label htmlFor="statusFollowsReply">Status folgt der Antwort</Label>
              <p className="text-sm text-muted-foreground">
                Agent antwortet: Wartet auf Anwender. Melder antwortet: In
                Bearbeitung.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">
            Automatisch schließen
          </CardTitle>
          <CardDescription>
            Läuft einmal täglich über den Bestand. Ein Agent kann jedes Ticket
            einzeln davon ausnehmen.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <DayPicker
            name="waitingReminderDays"
            label="Erinnerung an den Melder nach"
            value={settings.waitingReminderDays}
            disabled={pending}
          />

          <DayPicker
            name="waitingCloseDays"
            label="Wartend schließt nach der Erinnerung"
            value={settings.waitingCloseDays}
            disabled={pending}
          />

          {/* Eine Grenze, kein Hinweis: ohne Erinnerung schließt „Wartend" nie,
              egal was hier steht. */}
          <p className="text-sm text-muted-foreground">
            Ohne Erinnerung schließt „Wartet auf Anwender" nicht.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Texte</CardTitle>
          <CardDescription>
            Platzhalter wie in Textbausteinen: {"{{kunde.vorname}}"},{" "}
            {"{{ticket.nummer}}"}, {"{{ticket.kategorie}}"}.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="waitingReminderSubject">Betreff der Erinnerung</Label>
            <Input
              id="waitingReminderSubject"
              name="waitingReminderSubject"
              defaultValue={settings.waitingReminderSubject}
              disabled={pending}
              className="h-10 rounded-xl"
            />
            <p className="text-sm text-muted-foreground">
              Die Ticket-Nummer stellt MITS voran, damit Antworten das Ticket
              wiederfinden.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="waitingReminderBody">Text der Erinnerung</Label>
            <Textarea
              id="waitingReminderBody"
              name="waitingReminderBody"
              rows={7}
              defaultValue={settings.waitingReminderBody}
              disabled={pending}
              className="rounded-xl"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="autoCloseNote">Notiz beim Schließen</Label>
            <Textarea
              id="autoCloseNote"
              name="autoCloseNote"
              rows={3}
              defaultValue={settings.autoCloseNote}
              disabled={pending}
              className="rounded-xl"
            />
            <p className="text-sm text-muted-foreground">
              Steht als Antwort im Ticket, für den Melder lesbar.
            </p>
          </div>

          {result && (
            <Alert
              variant={result.ok ? "default" : "destructive"}
              className="rounded-2xl border-border px-4 py-3"
            >
              {result.ok ? <CheckCircle2Icon /> : <TriangleAlertIcon />}
              <AlertDescription>
                {result.ok ? result.message : result.error}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="justify-end rounded-b-3xl border-t border-border bg-transparent">
          <Button
            type="submit"
            className="h-10 rounded-full bg-inverse-surface px-5 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
            disabled={pending}
          >
            {pending && <Loader2Icon className="animate-spin" />}
            {pending ? "Speichern …" : "Speichern"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
