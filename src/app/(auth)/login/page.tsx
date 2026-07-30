import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Anmelden — MITS",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getSessionUser()) redirect("/tickets/new");

  const { next } = await searchParams;

  return (
    <Card className="rounded-3xl border border-border bg-card ring-0 shadow-elev-2">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Anmelden</CardTitle>
        <CardDescription className="mt-1 leading-relaxed">
          Mit deinem MITS-Konto anmelden, um Tickets zu erfassen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={safeNext(next)} />
      </CardContent>
    </Card>
  );
}

/**
 * Only same-site paths are accepted as a post-login target. Without this an
 * attacker could send `/login?next=https://evil.example` and use the app as an
 * open redirect.
 */
function safeNext(next: string | undefined): string {
  if (!next) return "/tickets/new";
  if (!next.startsWith("/") || next.startsWith("//")) return "/tickets/new";
  return next;
}
