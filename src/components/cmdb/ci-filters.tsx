"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CIStatus,
  CIType,
  CI_STATUS_LABELS,
  CI_TYPE_LABELS,
  type MITSOrganization,
} from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Filters for the item list.

   State lives in the URL, not in the component: a filtered inventory is something a
   agent sends to a colleague, and a `useState` filter cannot be linked to. It also
   means the page stays a server component and the list is filtered in SQL rather than
   in the browser.

   The sentinel for "all" is the absence of the parameter, so a cleared filter leaves no
   trace in the URL.
   ────────────────────────────────────────────────────────────────────────── */

const ALL = "__all";

export function CIFilters({
  organizations,
}: {
  organizations: MITSOrganization[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const push = (next: URLSearchParams) => {
    const query = next.toString();
    router.push(query ? `/mits/cmdb?${query}` : "/mits/cmdb");
  };

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    push(next);
  };

  const active =
    Boolean(params.get("q")) ||
    Boolean(params.get("type")) ||
    Boolean(params.get("status")) ||
    Boolean(params.get("org"));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          set("q", q.trim());
        }}
        className="relative min-w-56 flex-1"
      >
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden
        />
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Name, Inventarnummer, Seriennummer"
          aria-label="Objekte durchsuchen"
          className="h-10 rounded-xl pl-9"
        />
      </form>

      <Select value={params.get("type") ?? ALL} onValueChange={(v) => set("type", v)}>
        <SelectTrigger className="h-10 w-40 rounded-xl" aria-label="Art">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Arten</SelectItem>
          {CIType.options.map((type) => (
            <SelectItem key={type} value={type}>
              {CI_TYPE_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.get("status") ?? ALL}
        onValueChange={(v) => set("status", v)}
      >
        <SelectTrigger className="h-10 w-40 rounded-xl" aria-label="Zustand">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Jeder Zustand</SelectItem>
          {CIStatus.options.map((status) => (
            <SelectItem key={status} value={status}>
              {CI_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {organizations.length > 0 && (
        <Select value={params.get("org") ?? ALL} onValueChange={(v) => set("org", v)}>
          <SelectTrigger className="h-10 w-48 rounded-xl" aria-label="Firma">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alle Firmen</SelectItem>
            {organizations.map((organization) => (
              <SelectItem key={organization.id} value={organization.id}>
                {organization.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {active && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            push(new URLSearchParams());
          }}
          className="h-10 rounded-full px-3 text-xs text-muted-foreground"
        >
          <XIcon strokeWidth={1.5} />
          Filter zurücksetzen
        </Button>
      )}
    </div>
  );
}
