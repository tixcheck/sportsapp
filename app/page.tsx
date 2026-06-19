import Link from "next/link";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/user";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  // Logged-in visitors skip the marketing front door.
  const user = await getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- marketing logo, fixed height */}
        <img src="/logo.png" alt="MySportsApp" className="h-8 w-auto" />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Sign up</Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-16 text-center">
        <p className="text-claret text-xs font-semibold tracking-[0.16em] uppercase">
          Toronto volleyball
        </p>
        <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Run the league. Follow the game.
        </h1>
        <p className="text-ink-2 mx-auto mt-5 max-w-xl text-lg">
          Free league &amp; tournament management for organizers — and live
          schedules, standings, and scores for everyone playing or watching.
          Indoor 6s, beach 2s, and co-ed 4s.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/signup">Get started — it&apos;s free</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Log in</Link>
          </Button>
        </div>

        <div className="mx-auto mt-14 grid max-w-xl gap-x-8 gap-y-4 text-left text-sm sm:grid-cols-2">
          <p className="border-rule text-ink-2 border-t pt-3">
            <span className="text-ink font-display font-semibold">
              Organizers.
            </span>{" "}
            Pools, schedules, brackets, and standings — generated, not
            spreadsheet-ed. Always free.
          </p>
          <p className="border-rule text-ink-2 border-t pt-3">
            <span className="text-ink font-display font-semibold">
              Players &amp; fans.
            </span>{" "}
            Your matches, courts, and the live table — on your phone, in the
            sun.
          </p>
        </div>
      </main>

      <footer className="border-rule mx-auto w-full max-w-4xl border-t px-5 py-6">
        <div className="text-ink-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span>© 2026 MySportsApp</span>
          <nav className="flex gap-4">
            <Link href="/privacy" className="hover:text-ink-2">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink-2">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
