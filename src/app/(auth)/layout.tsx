import { MITSLogo } from "@/components/branding/mits-logo";

/** Shared frame for login and registration: no header, no navigation, just the form. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="bg-grid flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <MITSLogo showTagline />
        </div>
        {children}
      </div>
    </main>
  );
}
