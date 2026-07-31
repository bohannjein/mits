"use client";

import { CheckCircle2Icon, Loader2Icon, SaveIcon, TriangleAlertIcon } from "lucide-react";
import { useActionState } from "react";

import { saveUserRecordAction } from "@/app/admin/actions";
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
  NO_ORGANIZATION,
  type MITSLocation,
  type MITSOrganization,
  type MITSUserProfile,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   One account's name and contact details, edited by an admin.

   Rendered from the same `CUSTOMER_PROFILE_FIELDS` list as the self-service form and
   posting to an action that calls the same `setUserProfile`. Two masks over one field
   list rather than two field lists: an admin who fixes an address should be bound by
   the same website check as the reporter who typed it, and the alternative is two
   places that drift.

   The address is read-only here as well. It is the login identity, and this instance
   has no mail verification — changing it would hand somebody an account they cannot
   prove is theirs. Deliberate: an admin *could* be trusted with it, but there is no
   recovery path if it goes wrong.
   ────────────────────────────────────────────────────────────────────────── */

export function UserRecordForm({
  user,
  profile,
  locations,
  /** Empty on an instance with no companies; the field then does not appear. */
  organizations = [],
}: {
  user: { id: string; name: string; email: string };
  profile: MITSUserProfile;
  locations: MITSLocation[];
  organizations?: MITSOrganization[];
}) {
  const [result, formAction, saving] = useActionState(saveUserRecordAction, null);

  return (
    <form action={formAction} className="grid gap-4">
      {/* The id the action acts on. Only trustworthy because the action itself
          re-checks `requireRole("admin")` — see `saveUserRecordAction`. */}
      <input type="hidden" name="userId" value={user.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`name-${user.id}`}>Name</Label>
          <Input
            id={`name-${user.id}`}
            name="name"
            defaultValue={user.name}
            maxLength={120}
            disabled={saving}
            className="h-10 rounded-xl"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`email-${user.id}`}>E-Mail</Label>
          <Input
            id={`email-${user.id}`}
            value={user.email}
            readOnly
            disabled
            className="h-10 rounded-xl font-mono"
          />
        </div>

        {locations.length > 0 && (
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor={`location-${user.id}`}>Standort</Label>
            <Select
              name="location_id"
              defaultValue={profile.location_id ?? NO_LOCATION}
              disabled={saving}
            >
              <SelectTrigger
                id={`location-${user.id}`}
                className="h-10 w-full rounded-xl"
              >
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

        {/* Only an admin gets this field at all — see the note on
            `MITSUserProfileSchema.organization_id` for why the self-service form
            cannot offer it even if somebody adds the input. */}
        {organizations.length > 0 && (
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor={`organization-${user.id}`}>Firma</Label>
            <Select
              name="organization_id"
              defaultValue={profile.organization_id ?? NO_ORGANIZATION}
              disabled={saving}
            >
              <SelectTrigger
                id={`organization-${user.id}`}
                className="h-10 w-full rounded-xl"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ORGANIZATION}>Keine Angabe</SelectItem>
                {organizations.map((organization) => (
                  <SelectItem key={organization.id} value={organization.id}>
                    {organization.name}
                    {organization.code ? ` (${organization.code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {CUSTOMER_PROFILE_FIELDS.map((field) => {
          const id = `${field.key}-${user.id}`;
          const wide = field.widget === "textarea" || field.key === "street";

          return (
            <div
              key={field.key}
              className={wide ? "grid gap-2 sm:col-span-2" : "grid gap-2"}
            >
              <Label htmlFor={id}>{field.label}</Label>
              {field.widget === "textarea" ? (
                <Textarea
                  id={id}
                  name={field.key}
                  defaultValue={profile[field.key]}
                  maxLength={field.max}
                  rows={2}
                  disabled={saving}
                  className="rounded-xl"
                />
              ) : (
                <Input
                  id={id}
                  name={field.key}
                  type={field.widget === "tel" ? "tel" : "text"}
                  defaultValue={profile[field.key]}
                  maxLength={field.max}
                  placeholder={field.key === "website" ? "example.de" : undefined}
                  disabled={saving}
                  className="h-10 rounded-xl"
                />
              )}
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
        size="sm"
        disabled={saving}
        className="h-9 w-fit rounded-full bg-surface-elevated px-4 text-foreground hover:bg-accent"
      >
        {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon strokeWidth={1.5} />}
        {saving ? "Speichern …" : "Speichern"}
      </Button>
    </form>
  );
}
