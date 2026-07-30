"use client";

import { Loader2Icon, SaveIcon } from "lucide-react";
import { useActionState, useState } from "react";

import { setUserRoleAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MITS_ROLES, ROLE_LABELS, type MITSRole } from "@/lib/auth/roles";

/**
 * Role picker for one row of the user table. The submit button only appears once
 * the value actually differs, so the table does not look like a page full of
 * pending edits.
 */
export function UserRoleForm({
  userId,
  currentRole,
  disabled = false,
  disabledReason,
}: {
  userId: string;
  currentRole: MITSRole;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [result, formAction, pending] = useActionState(setUserRoleAction, null);
  const [role, setRole] = useState<MITSRole>(currentRole);

  const changed = role !== currentRole;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={role} />

      <Select
        value={role}
        onValueChange={(value) => setRole(value as MITSRole)}
        disabled={disabled || pending}
      >
        <SelectTrigger className="h-9 w-44 rounded-xl" aria-label="Rolle">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MITS_ROLES.map((value) => (
            <SelectItem key={value} value={value}>
              {ROLE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {changed && !disabled && (
        <Button
          type="submit"
          size="sm"
          className="h-9 rounded-full bg-inverse-surface px-4 text-inverse-surface-foreground hover:bg-inverse-surface-hover"
          disabled={pending}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          Übernehmen
        </Button>
      )}

      {disabled && disabledReason && (
        <span className="text-xs text-muted-foreground">{disabledReason}</span>
      )}

      {result && !result.ok && (
        <span className="text-xs font-medium text-destructive">{result.error}</span>
      )}
    </form>
  );
}
