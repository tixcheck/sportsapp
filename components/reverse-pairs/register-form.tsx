"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import { registerReversePairAction } from "@/server/actions/reverse-pairs";
import { pairName as pairNameFor } from "@/lib/reverse-pairs/pair-name";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Sign a pair up, from the public page.
 *
 * No pair name to type: a pair is named for its people — "Dani/Mel", or
 * "Dani/TBD" for someone signing up before they've found a partner — and the
 * database renames it as the partner is invited or joins. The partner is
 * optional here and can be invited later from the pair's page; either way
 * they're invited rather than silently added, so they end up with an account
 * of their own and can see the schedule without borrowing a phone.
 *
 * The rules that decide whether this succeeds live in the database, because
 * "is there a spot left" is a race. This form only tries.
 */
export function ReversePairsRegisterForm({
  competitionId,
  signedIn,
  me,
  feeLabel,
  spotsLeft,
}: {
  competitionId: string;
  signedIn: boolean;
  /** The signed-in player, to show the name they'll register under. */
  me: { displayName: string | null; email: string | null } | null;
  /** e.g. "$40.00 per pair", or null when the event is free. */
  feeLabel: string | null;
  /** Null when uncapped. */
  spotsLeft: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [partnerName, setPartnerName] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await registerReversePairAction({
        competitionId,
        partnerName,
        partnerEmail,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      // A paid event holds the spot but only draws a pair that has paid — so
      // straight to the team page, where either partner can pay.
      if (res.payNow) {
        toast.success("Pair registered — pay to lock in your spot.");
        router.push(`/teams/${res.teamId}`);
        return;
      }
      toast.success("You're in. See you on the day.");
      setPartnerName("");
      setPartnerEmail("");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Register your pair</CardTitle>
        <CardDescription>
          {feeLabel ? <>{feeLabel}. </> : <>Free to enter. </>}
          {spotsLeft !== null && (
            <>
              {spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!signedIn ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Sign in first so we know who to reach on the day.
            </p>
            <Button asChild>
              <Link href="/login">Sign in to register</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <p className="text-sm">
              Your pair will be listed as{" "}
              <span className="font-semibold">
                {pairNameFor(me ?? {}, partnerName)}
              </span>
              .
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="rp-partner">Partner&rsquo;s name</Label>
                <Input
                  id="rp-partner"
                  maxLength={80}
                  placeholder="Optional"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rp-email">Partner&rsquo;s email</Label>
                <Input
                  id="rp-email"
                  type="email"
                  placeholder="Optional"
                  value={partnerEmail}
                  onChange={(e) => setPartnerEmail(e.target.value)}
                />
              </div>
            </div>
            <p className="text-ink-3 -mt-2 text-xs">
              No partner yet? Leave these blank and invite them later from your
              pair&rsquo;s page. Either way we email them an invite to join
              {feeLabel ? " — and pay their half, if you're splitting it" : ""}.
            </p>

            <Button
              type="submit"
              disabled={pending}
              className="justify-self-start"
            >
              {pending ? "Registering…" : "Register"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
