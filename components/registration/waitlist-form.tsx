"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DateTime } from "luxon";

import { joinWaitlistAction } from "@/server/actions/waitlist";
import type { WaitlistEntry } from "@/lib/queries/waitlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Joining the queue for a full event.
 *
 * Asks for less than the registration form does — a name and an email — because
 * this is an expression of interest, not an entry. Everything else is collected
 * if and when they're offered a spot, so nobody fills in a six-person roster
 * for a place they may never get.
 */
export function WaitlistForm({
  competitionId,
  divisions,
  fullDivisionIds,
  competitionFull,
  isAuthed,
  userEmail,
  loginHref,
  existing,
  claimHours,
}: {
  competitionId: string;
  divisions: { id: string; name: string }[];
  /** Tiers with no room. Others are still open for normal registration. */
  fullDivisionIds: string[];
  competitionFull: boolean;
  isAuthed: boolean;
  userEmail?: string;
  loginHref: string;
  existing?: WaitlistEntry | null;
  claimHours: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const full = new Set(fullDivisionIds);
  // Only queue for a tier that's actually full; a tier with room takes a normal
  // registration and putting it in this list would be a dead end.
  const queueable = competitionFull
    ? divisions
    : divisions.filter((d) => full.has(d.id));

  const [teamName, setTeamName] = useState("");
  const [email, setEmail] = useState(userEmail ?? "");
  const [divisionId, setDivisionId] = useState(queueable[0]?.id ?? "");

  if (existing) {
    const offered = existing.status === "offered";
    return (
      <div className="border-border bg-paper-sunken rounded-lg border p-4">
        <p className="text-sm font-semibold">
          {offered
            ? "A spot has opened for you"
            : `${existing.teamName} is on the waitlist`}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          {offered ? (
            <>
              Check your email for the claim link
              {existing.offerExpiresAt
                ? ` — it expires ${DateTime.fromISO(existing.offerExpiresAt).toFormat("cccc h:mm a")}`
                : ""}
              .
            </>
          ) : (
            <>
              {existing.position
                ? `You're number ${existing.position} in the queue`
                : "You're in the queue"}
              {existing.divisionName ? ` for ${existing.divisionName}` : ""}.
              We&apos;ll email you if a place comes free.
            </>
          )}
        </p>
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className="grid gap-3">
        <p className="text-muted-foreground text-sm">
          Sign in to join the waitlist.
        </p>
        <Button asChild variant="outline" className="justify-self-start">
          <Link href={loginHref}>Sign in</Link>
        </Button>
      </div>
    );
  }

  function submit() {
    if (!teamName.trim()) {
      toast.error("Give your team a name.");
      return;
    }
    start(async () => {
      const res = await joinWaitlistAction({
        competitionId,
        divisionId: divisionId || null,
        teamName: teamName.trim(),
        contactEmail: email.trim(),
        playerEmails: [],
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        "You're on the waitlist — we'll email you if a spot opens.",
      );
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="wl-team">Team name</Label>
        <Input
          id="wl-team"
          placeholder="Net Gains"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="wl-email">Email</Label>
        <Input
          id="wl-email"
          type="email"
          placeholder="captain@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          Where we send the offer. You&apos;ll have {claimHours} hours to claim
          a spot before it passes to the next team.
        </p>
      </div>

      {queueable.length > 1 && (
        <div className="grid gap-1.5">
          <Label htmlFor="wl-tier">Which tier?</Label>
          <select
            id="wl-tier"
            value={divisionId}
            onChange={(e) => setDivisionId(e.target.value)}
            className="border-input bg-surface h-9 rounded-md border px-3 text-sm"
          >
            {queueable.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Each tier has its own queue.
          </p>
        </div>
      )}

      <Button
        onClick={submit}
        disabled={pending}
        className="justify-self-start"
      >
        {pending ? "Joining…" : "Join the waitlist"}
      </Button>

      <p className="text-muted-foreground text-xs">
        Nothing is charged to join, and nothing is charged if you&apos;re
        offered a spot — you pay only once you&apos;ve claimed it.
      </p>
    </div>
  );
}
