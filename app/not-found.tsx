import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">
        We couldn&apos;t find that page
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        The link may be old, or the event may have moved. Your dashboard lists
        everything you&apos;re part of.
      </p>
      <Button asChild>
        <Link href="/dashboard">Go to my dashboard</Link>
      </Button>
      <p className="text-muted-foreground text-xs">
        Still stuck? Tap Help at the bottom right of your dashboard.
      </p>
    </main>
  );
}
