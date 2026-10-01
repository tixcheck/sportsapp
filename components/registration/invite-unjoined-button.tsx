"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { inviteUnjoinedPlayersAction } from "@/server/actions/free-agents";
import { Button } from "@/components/ui/button";

/**
 * Email drafted players who haven't joined.
 *
 * `notInvited` first, because that's the click that matters: players on a team
 * with an email who have never been told. Once everyone has been emailed it
 * becomes "Resend", which asks first — re-emailing a whole league is the kind
 * of thing that should take two clicks.
 */
export function InviteUnjoinedButton({
  competitionId,
  notInvited,
  invitedNotJoined,
}: {
  competitionId: string;
  notInvited: number;
  invitedNotJoined: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (notInvited === 0 && invitedNotJoined === 0) return null;
  const resend = notInvited === 0;

  function send() {
    if (
      resend &&
      !window.confirm(
        `Email the ${invitedNotJoined} player${invitedNotJoined === 1 ? "" : "s"} who were invited but haven't joined, again?`,
      )
    ) {
      return;
    }
    start(async () => {
      const res = await inviteUnjoinedPlayersAction({ competitionId, resend });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (res.failed > 0) {
        toast.error(
          `${res.sent} sent, ${res.failed} couldn't be sent — try again in a minute.`,
        );
      } else {
        toast.success(
          `Invite sent to ${res.sent} player${res.sent === 1 ? "" : "s"}.`,
        );
      }
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={send} disabled={pending}>
      <Mail className="size-3.5" />
      {pending
        ? "Sending…"
        : resend
          ? `Resend invites (${invitedNotJoined})`
          : `Invite ${notInvited} not joined`}
    </Button>
  );
}
