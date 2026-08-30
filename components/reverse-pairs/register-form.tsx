"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import { registerReversePairAction } from "@/server/actions/reverse-pairs";
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
 * One name for the pair and, optionally, the partner's email. The partner is
 * invited rather than silently added, so they end up with an account of their
 * own and can see the schedule without borrowing a phone.
 *
 * The rules that decide whether this succeeds live in the database, because
 * "is there a spot left" is a race. This form only tries.
 */
export function ReversePairsRegisterForm({
  competitionId,
  signedIn,
  feeLabel,
  spotsLeft,
}: {
  competitionId: string;
  signedIn: boolean;
  /** e.g. "$40.00 per pair", or null when the event is free. */
  feeLabel: string | null;
  /** Null when uncapped. */
  spotsLeft: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pairName, setPairName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await registerReversePairAction({
        competitionId,
        pairName,
        partnerName,
        partnerEmail,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("You're in. See you on the day.");
      setPairName("");
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
            <div className="grid gap-1.5">
              <Label htmlFor="rp-name">Pair name</Label>
              <Input
                id="rp-name"
                required
                maxLength={80}
                placeholder="Sam &amp; Mel"
                value={pairName}
                onChange={(e) => setPairName(e.target.value)}
              />
              <p className="text-ink-3 text-xs">
                However you want to appear on the schedule.
              </p>
            </div>

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
              We&rsquo;ll invite them so they can see the schedule too.
            </p>

            <Button
              type="submit"
              disabled={pending || pairName.trim().length < 2}
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
