"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { claimWaitlistSpotAction } from "@/server/actions/waitlist";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The claim button.
 *
 * Deliberately a press, not an effect on mount: mail clients and link scanners
 * pre-fetch URLs, and a claim that fires on page load would register a team on
 * someone's behalf before they had read the page.
 */
export function WaitlistClaim({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  function claim() {
    start(async () => {
      const res = await claimWaitlistSpotAction(token);
      if ("error" in res) {
        setFailed(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("You're in — welcome to the league.");
      router.push(`/teams/${res.teamId}`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{failed ? "That didn't work" : "Claim your spot"}</CardTitle>
        <CardDescription>
          {failed ??
            "A place has come free and it's held for you. Claiming registers your team — nothing is charged here."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!failed && (
          <Button onClick={claim} disabled={pending} size="lg">
            {pending ? "Claiming…" : "Claim our spot"}
          </Button>
        )}
        {failed && (
          <p className="text-muted-foreground text-sm">
            If you think this is a mistake, reply to the email you received and
            the organizer can offer it again.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
