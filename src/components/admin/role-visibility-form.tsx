"use client";

import {
  CheckCircle2Icon,
  Loader2Icon,
  SaveIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useActionState, useState } from "react";

import { saveRoleVisibilityAction } from "@/app/admin/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE_LABELS_PLURAL } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ROLE_VISIBILITY,
  NAV_AREA_META,
  RESTRICTABLE_ROLES,
  areasForRole,
  type NavArea,
  type RestrictableRole,
  type RoleVisibility,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Sichtbarkeit je Rolle.

   Ein Schalter heißt **sichtbar**, nicht „ausgeblendet". Gespeichert wird die
   Gegenrichtung — eine Liste des Weggenommenen —, und genau deshalb steht die
   Umkehrung hier und nicht in der Maske: ein Feld, das man einschaltet, um
   etwas wegzunehmen, wird beim Überfliegen falsch gelesen, und der Preis dafür
   ist eine Rolle, die plötzlich nichts mehr sieht.
   ────────────────────────────────────────────────────────────────────────── */

export interface FormEntry {
  id: string;
  title: string;
  category: string;
  /** Das Freitext-Formular. Trägt den Reiter „Schnellerstellung". */
  fallback: boolean;
}

export function RoleVisibilityForm({
  visibility,
  forms,
}: {
  visibility: RoleVisibility;
  forms: FormEntry[];
}) {
  const [current, setCurrent] = useState(visibility);
  const [result, formAction, saving] = useActionState(
    saveRoleVisibilityAction,
    null,
  );

  const changed = JSON.stringify(current) !== JSON.stringify(visibility);

  const setForm = (role: RestrictableRole, id: string, visible: boolean) =>
    setCurrent((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        hidden_forms: visible
          ? prev[role].hidden_forms.filter((entry) => entry !== id)
          : [...new Set([...prev[role].hidden_forms, id])],
      },
    }));

  const setArea = (role: RestrictableRole, area: NavArea, visible: boolean) =>
    setCurrent((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        hidden_areas: visible
          ? prev[role].hidden_areas.filter((entry) => entry !== area)
          : [...new Set([...prev[role].hidden_areas, area])],
      },
    }));

  return (
    <div className="grid gap-6">
      <Tabs defaultValue={RESTRICTABLE_ROLES[0]}>
        <TabsList className="rounded-full">
          {RESTRICTABLE_ROLES.map((role) => {
            const taken =
              current[role].hidden_forms.length +
              current[role].hidden_areas.length;

            return (
              <TabsTrigger
                key={role}
                value={role}
                className="rounded-full px-4"
              >
                {ROLE_LABELS_PLURAL[role]}
                {taken > 0 && (
                  <Badge
                    variant="outline"
                    className="ml-2 h-auto rounded-full px-2 py-0 text-[11px] font-normal"
                  >
                    {taken}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {RESTRICTABLE_ROLES.map((role) => (
          <TabsContent key={role} value={role} className="mt-6 grid gap-6">
            <IntakeWarning role={role} current={current} forms={forms} />

            <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Bereiche</CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Abgeschaltet verschwindet der Bereich aus der Navigation, und
                  der direkte Aufruf landet auf der Startseite dieser Rolle.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {areasForRole(role).map((area) => {
                  const meta = NAV_AREA_META[area];
                  const visible = !current[role].hidden_areas.includes(area);

                  return (
                    <Row
                      key={area}
                      id={`${role}-${area}`}
                      label={meta.label}
                      description={meta.description}
                      visible={visible}
                      disabled={saving}
                      onChange={(next) => setArea(role, area, next)}
                    />
                  );
                })}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-1">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Formulare</CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Ein abgeschaltetes Formular fehlt im Katalog, und ein Entwurf
                  darauf wird beim Absenden abgelehnt. Bereits damit erfasste
                  Tickets bleiben lesbar.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {forms.map((form) => {
                  const visible = !current[role].hidden_forms.includes(form.id);

                  return (
                    <Row
                      key={form.id}
                      id={`${role}-form-${form.id}`}
                      label={form.title}
                      description={
                        form.fallback
                          ? "Freitext-Meldung. Trägt den Reiter „Schnellerstellung“ — ohne dieses Formular gibt es den Reiter nicht."
                          : form.category
                      }
                      mono={form.id}
                      visible={visible}
                      disabled={saving}
                      onChange={(next) => setForm(role, form.id, next)}
                    />
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="visibility" value={JSON.stringify(current)} />
        <Button
          type="submit"
          size="lg"
          className="h-11 rounded-full bg-inverse-surface px-6 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          disabled={saving || !changed}
        >
          {saving ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SaveIcon strokeWidth={1.5} />
          )}
          {saving
            ? "Speichern …"
            : changed
              ? "Sichtbarkeit speichern"
              : "Keine Änderung"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 rounded-full px-4"
          disabled={saving}
          onClick={() => setCurrent(DEFAULT_ROLE_VISIBILITY)}
        >
          Alles sichtbar machen
        </Button>
      </form>

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
    </div>
  );
}

function Row({
  id,
  label,
  description,
  mono,
  visible,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  mono?: string;
  visible: boolean;
  disabled: boolean;
  onChange: (visible: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-background px-4 py-3.5",
        !visible && "opacity-70",
      )}
    >
      <div className="min-w-56 flex-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
        {mono && (
          <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
            {mono}
          </span>
        )}
      </div>

      <Switch
        id={id}
        checked={visible}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * Der eine Zustand, den man versehentlich herstellt.
 *
 * Drei Schalter, die einzeln harmlos sind, nehmen zusammen den letzten Weg in
 * ein Ticket: kein Freitext-Formular, kein Katalogeintrag, kein KI-Chat. Der
 * Eingang steht dann als leere Seite da, und niemand am Bildschirm sieht,
 * welcher der drei Schalter dafür verantwortlich ist.
 */
function IntakeWarning({
  role,
  current,
  forms,
}: {
  role: RestrictableRole;
  current: RoleVisibility;
  forms: FormEntry[];
}) {
  const hiddenForms = current[role].hidden_forms;
  const hiddenAreas = current[role].hidden_areas;

  if (hiddenAreas.includes("customer_new")) return null;

  const anyForm = forms.some((form) => !hiddenForms.includes(form.id));
  if (anyForm || !hiddenAreas.includes("intake_ai")) return null;

  return (
    <Alert className="rounded-2xl border-warning/40 px-4 py-3">
      <TriangleAlertIcon strokeWidth={1.5} />
      <AlertTitle>Kein Weg mehr ins Ticket</AlertTitle>
      <AlertDescription>
        Ohne Formular und ohne KI-Assistent bleibt der Ticketeingang für diese
        Rolle leer. Tickets kommen dann nur noch per E-Mail oder über die
        Schnittstelle herein.
      </AlertDescription>
    </Alert>
  );
}
