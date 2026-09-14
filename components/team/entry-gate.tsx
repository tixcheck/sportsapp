import Link from "next/link";
import { ShieldAlert, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { TeamEntryGate } from "@/lib/teams/entry-gate";

/**
 * Shown in place of a team's schedule while something is holding it back.
 *
 * The team is not an entrant yet, so there is nothing to show — but "No
 * matches yet" would be a lie by omission, and a captain reading it goes
 * looking for a scheduling problem instead of doing the one thing that would
 * fix it.
 *
 * It explains BOTH reasons a team is held, because for a while it only
 * explained signatures: BVL teams that had every signature in but were a
 * player short fell through to "No matches yet" and were told nothing at all.
 *
 * Outstanding players are named, because a count is not actionable and a list
 * is. Everyone on the roster sees it — it is their captain and their teammates
 * who do the chasing, and it is the fact they are all waiting on. What nobody
 * sees is anything about a signature beyond whether it exists.
 */
export function EntryGate({
  gate,
  isMember,
  viewerId,
}: {
  gate: TeamEntryGate;
  /** Whether the viewer is on this team (or the organizer). */
  isMember: boolean;
  viewerId: string | null;
}) {
  return (
    <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/40">
      {gate.reason === "roster" ? (
        <RosterReason gate={gate} isMember={isMember} />
      ) : (
        <WaiverReason gate={gate} isMember={isMember} viewerId={viewerId} />
      )}
    </div>
  );
}

function Heading({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
      {icon}
      {children}
    </p>
  );
}

function RosterReason({
  gate,
  isMember,
}: {
  gate: Extract<TeamEntryGate, { reason: "roster" }>;
  isMember: boolean;
}) {
  const { rosterSize, minRoster, shortBy } = gate;
  return (
    <>
      <Heading icon={<UserPlus className="size-4" />}>
        {shortBy === 1 ? "One more player" : `${shortBy} more players`}
      </Heading>

      <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-200/90">
        This team isn&apos;t in the schedule yet. This league needs {minRoster}{" "}
        players on a roster and you have {rosterSize}
        {rosterSize === 0 ? " so far" : ""}.
      </p>

      {isMember && (
        <p className="mt-3 text-sm text-amber-900/90 dark:text-amber-200/90">
          The captain can add them from the roster below — everyone invited also
          signs the waiver before the team is entered.
        </p>
      )}
    </>
  );
}

function WaiverReason({
  gate,
  isMember,
  viewerId,
}: {
  gate: Extract<TeamEntryGate, { reason: "waiver" }>;
  isMember: boolean;
  viewerId: string | null;
}) {
  const you = gate.outstanding.find((p) => p.userId === viewerId);
  const others = gate.outstanding.filter((p) => p.userId !== viewerId);

  return (
    <>
      <Heading icon={<ShieldAlert className="size-4" />}>
        Waiting on the waiver
      </Heading>

      <p className="mt-2 text-sm text-amber-900/90 dark:text-amber-200/90">
        This team isn&apos;t in the schedule yet. Every player has to sign the
        waiver before it can be — that&rsquo;s{" "}
        {gate.outstanding.length === 1
          ? "one player"
          : `${gate.outstanding.length} players`}{" "}
        outstanding.
      </p>

      {isMember && (
        <>
          {others.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-amber-900/90 dark:text-amber-200/90">
              {others.map((p) => (
                <li key={p.userId}>· {p.name}</li>
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
    </>
  );
}
