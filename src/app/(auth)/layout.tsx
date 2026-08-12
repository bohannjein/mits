import { AuthShell } from "@/components/auth/auth-shell";

/** Shared frame for login and registration: no header, no navigation, just the form. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthShell>{children}</AuthShell>;
}
