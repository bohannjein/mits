import { MITSLogo } from "@/components/branding/mits-logo";

/**
 * Rahmen für jede Anmeldefläche: kein Header, keine Navigation, nur das Logo
 * und die Karte.
 *
 * Eine Komponente und nicht zweimal dasselbe Markup, weil es diese Fläche jetzt
 * an zwei Stellen gibt: als Layout der `(auth)`-Gruppe und auf `/mits/login`,
 * das außerhalb dieser Gruppe liegt und sie deshalb nicht erben kann. Zwei
 * Kopien wären zwei Anmeldemasken, die sich nach der ersten Änderung an einer
 * von beiden unterscheiden.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-aurora flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <MITSLogo showTagline />
        </div>
        {children}
      </div>
    </main>
  );
}
