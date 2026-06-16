import Link from "next/link";

import { getUser } from "@/lib/auth/user";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const user = await getUser();

  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center px-4 text-center">
      <div className="max-w-xl">
        <span className="bg-primary text-primary-foreground mx-auto mb-6 grid size-12 place-items-center rounded-xl text-lg font-semibold">
          V
        </span>
        <h1 className="font-display text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
          Volleyball, made simple.
        </h1>
        <p className="text-muted-foreground mt-3">
          Leagues and tournaments for indoor 6s, beach 2s, and co-ed 4s. Free
          for organizers — built for the Toronto volleyball community.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          {user ? (
            <Button asChild size="lg">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg">
                <Link href="/signup">Get started</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
