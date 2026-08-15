"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateIndividualSignupSettingsAction } from "@/server/actions/free-agents";
import { hasPositions } from "@/lib/sports";
import type { Sport } from "@/lib/formats";
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
 * Whether this event takes players who have no team, and what they pay.
 *
 * The fee is entered in dollars and stored in cents — every amount in the
 * payments code is integer cents, and the conversion belongs at the edge where
 * a human types a price, not in the middle of the money math.
 */
export function IndividualSignupSettings({
  competitionId,
  sport,
  allowIndividualSignups,
  individualFeeCents,
}: {
  competitionId: string;
  sport: Sport;
  allowIndividualSignups: boolean;
  individualFeeCents: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [allow, setAllow] = useState(allowIndividualSignups);
  const [fee, setFee] = useState(
    individualFeeCents > 0 ? String(individualFeeCents / 100) : "",
  );

  function save() {
    const dollars = fee.trim() === "" ? 0 : Number(fee);
    if (!Number.isFinite(dollars) || dollars < 0) {
      toast.error("That fee doesn't look right.");
      return;
    }
    startTransition(async () => {
      const result = await updateIndividualSignupSettingsAction({
        competitionId,
        allowIndividualSignups: allow,
        individualFeeCents: Math.round(dollars * 100),
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Individual sign-ups</CardTitle>
        <CardDescription>
          Let players without a team put their name down. They answer{" "}
          {hasPositions(sport)
            ? "which positions they play and what level they're at"
            : "what level they're at"}
          , and you place them on a team.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={allow}
            onChange={(e) => setAllow(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <span className="text-sm">
            Accept individual sign-ups
            <span className="text-muted-foreground block text-xs">
              Shown on the registration page alongside team sign-up. Individuals
              don&apos;t count against your team cap.
            </span>
          </span>
        </label>

        <div className="grid gap-1.5">
          <Label htmlFor="individual-fee">Fee per individual</Label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">$</span>
            <Input
              id="individual-fee"
              inputMode="decimal"
              placeholder="0.00"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="max-w-32"
              disabled={!allow}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Separate from the team fee — leave blank for free. A player
            isn&apos;t added to your pool until this is paid.
          </p>
        </div>

        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
