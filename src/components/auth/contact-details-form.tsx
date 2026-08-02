"use client";

import { CheckCircle2Icon, Loader2Icon, SaveIcon, TriangleAlertIcon } from "lucide-react";
import { useActionState } from "react";

import { changeOwnProfile } from "@/app/settings/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOMER_PROFILE_FIELDS,
  NO_LOCATION,
  type MITSLocation,
  type MITSUserProfile,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Own location, address and website.

   Rendered from `CUSTOMER_PROFILE_FIELDS` rather than written out field by field:
   the admin-side configurator is meant to switch these on and off and mark them
   required, and that has to be an override of the list, not an edit of this file.

   A plain form post — no controlled state. Every field is a free-text string with no
   cross-field rule, so keeping copies in React would buy nothing and cost the usual
   "value went stale after a save" bug.
   ────────────────────────────────────────────────────────────────────────── */

export function ContactDetailsForm({
  profile,
  locations,
}: {
  profile: MITSUserProfile;
  /** Active sites only — a closed branch should not be selectable. */
  locations: MITSLocation[];
}) {
  const [result, formAction, saving] = useActionState(changeOwnProfile, null);

  return (
    <form action={formAction} className="grid gap-5">
      {locations.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="profile-location">Standort</Label>
          <Select
            name="location_id"
            defaultValue={profile.location_id ?? NO_LOCATION}
            disabled={saving}
          >
            <SelectTrigger id="profile-location" className="h-10 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LOCATION}>Keine Angabe</SelectItem>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                  {location.code ? ` (${location.code})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {CUSTOMER_PROFILE_FIELDS.map((field) => {
          const id = `profile-${field.key}`;
          const value = profile[field.key];

          if (field.widget === "textarea") {
            return (
              <div key={field.key} className="grid gap-2 sm:col-span-2">
                <Label htmlFor={id}>{field.label}</Label>
                <Textarea
                  id={id}
                  name={field.key}
                  defaultValue={value}
                  maxLength={field.max}
                  rows={2}
                  disabled={saving}
                  className="rounded-xl"
                />
              </div>
            );
          }

          return (
            <div
              key={field.key}
              className={field.key === "street" ? "grid gap-2 sm:col-span-2" : "grid gap-2"}
            >
              <Label htmlFor={id}>{field.label}</Label>
              <Input
                id={id}
                name={field.key}
                type={field.widget === "tel" ? "tel" : "text"}
                defaultValue={value}
                maxLength={field.max}
                autoComplete={"autoComplete" in field ? field.autoComplete : undefined}
                // Not type="url": the browser would refuse "example.de" before the
                // server gets a chance to prepend the scheme, which is the friendlier
                // behaviour and is what `normaliseWebsite` is for.
                placeholder={field.key === "website" ? "example.de" : undefined}
                disabled={saving}
                className="h-10 rounded-xl"
              />
            </div>
          );
        })}
      </div>

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
        disabled={saving}
        className="w-fit rounded-full bg-surface-elevated px-5 text-foreground hover:bg-accent"
      >
        {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon strokeWidth={1.5} />}
        {saving ? "Speichern …" : "Angaben speichern"}
      </Button>
    </form>
  );
}
