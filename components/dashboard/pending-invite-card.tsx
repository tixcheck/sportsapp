"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { claimTeamAction } from "@/server/actions/teams";
import type { PendingInvite } from "@/lib/queries/dashboard";
import { Button } from "@/components/ui/button";

export function PendingInviteCard({
  invite,
  role,
}: {
  invite: PendingInvite;
  /** Display label for the role the invite grants. */
  role: "captain" | "player";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function claim() {
    start(async () => {
      const res = await claimTeamAction(invite.token);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`You've joined ${invite.teamName}.`);
      router.refresh();
    });
  }

  return (
    <div className="border-gold-300 bg-gold-300/15 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <Mail className="text-coral-700 mt-0.5 size-5 shrink-0" />
        {/* "Claim" is only for a captain taking over a team. A player invited
            onto someone else's team saw "Claim" too and read it as being told
            to take a team that wasn't theirs (review, 2026-09-14). */}
        <p className="text-sm">
          {role === "captain"
            ? "You've been invited to captain "
            : "You've been invited to join "}
          <span className="font-semibold">{invite.teamName}</span> in{" "}
          <span className="font-semibold">{invite.competitionName}</span>.
        </p>
      </div>
      <Button onClick={claim} disabled={pending} size="sm">
        {pending ? "Joining…" : role === "captain" ? "Claim team" : "Join team"}
      </Button>
    </div>
  );
}
