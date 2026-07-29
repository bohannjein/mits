import Link from "next/link";

import { UserMenu } from "@/components/auth/user-menu";
import { MITSLogo } from "@/components/branding/mits-logo";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Application header. A server component so the identity block renders with the
 * first paint instead of appearing after a client-side session fetch.
 */
export async function AppHeader() {
  const user = await getSessionUser();

  return (
    <header className="border-b-2 border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Link href="/" className="rounded-sm outline-ring/50 focus-visible:outline-2">
          <MITSLogo />
        </Link>

        {user ? (
          <UserMenu user={user} />
        ) : (
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="rounded-sm">
              <Link href="/login">Anmelden</Link>
            </Button>
            <Button asChild size="sm" className="rounded-sm">
              <Link href="/register">Registrieren</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
