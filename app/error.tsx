"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        That page didn&apos;t load. Trying again usually fixes it.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">My dashboard</Link>
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        If it keeps happening, email{" "}
        <a href={SUPPORT_MAILTO} className="underline underline-offset-2">
          {SUPPORT_EMAIL}
        </a>
        {error.digest ? ` and mention code ${error.digest}` : ""}.
      </p>
    </main>
  );
}
