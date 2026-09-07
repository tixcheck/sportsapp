import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Shown in place of a team's schedule while signatures are outstanding.
 *
 * The team is not an entrant yet, so there is nothing to show — but "No
 * matches yet" would be a lie by omission, and a captain reading it goes
 * looking for a scheduling problem instead of chasing two teammates.
 *
 * Names them. A count is not actionable; a list is. Everyone on the roster can
 * see who is outstanding, because it is their captain and their teammates who
 * will do the chasing, and because that is the fact they are all waiting on.
 * What nobody sees is anything about the signature itself beyond whether it
 * exists.
 */
export function WaiverGate({
  outstanding,
  isMember,
}: {
  /** Rostered players who haven't signed. */
  outstanding: { name: string; isViewer: boolean }[];
  /** Whether the viewer is on this team (or the organizer). */
  isMember: boolean;
}) {
  const you = outstanding.find((p) => p.isViewer);
  const others = outstanding.filter((p) => !p.isViewer);

  return (
    <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/40">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <ShieldAlert className="size-4" />
        Waiting on the waiver
      </p>

      <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-200/90">
        This team isn&apos;t in the schedule yet. Every player has to sign the
        waiver before it can be — that&rsquo;s{" "}
        {outstanding.length === 1
          ? "one player"
          : `${outstanding.length} players`}{" "}
        outstanding.
      </p>

      {isMember && (
        <>
          {others.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-amber-900/90 dark:text-amber-200/90">
              {others.map((p, i) => (
                <li key={i}>· {p.name}</li>
              ))}
            </ul>
          )}

          {you && (
            <div className="mt-4">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                One of them is you.
              </p>
              <Button asChild size="sm" className="mt-2">
                <Link href="/dashboard">Read and sign it</Link>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
