"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, EyeOff, Globe } from "lucide-react";
import { toast } from "sonner";

import {
  publishLeagueAction,
  unpublishLeagueAction,
} from "@/server/actions/leagues";
import {
  publishTournamentAction,
  unpublishTournamentAction,
} from "@/server/actions/tournaments";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function PublishToggle({
  competitionId,
  status,
  slug,
  kind = "league",
}: {
  competitionId: string;
  status: string;
  slug: string;
  kind?: "league" | "tournament";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const published = status === "open";
  const isTournament = kind === "tournament";
  const basePath = isTournament ? "/t" : "/l";

  async function run() {
    const publish = isTournament
      ? publishTournamentAction
      : publishLeagueAction;
    const unpublish = isTournament
      ? unpublishTournamentAction
      : unpublishLeagueAction;
    const result = published
      ? await unpublish(competitionId)
      : await publish(competitionId);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(
      published
        ? isTournament
          ? "Registration closed — public page is offline."
          : "Unpublished — public page is offline."
        : isTournament
          ? "Registration open — the public page is live."
          : "Published — the public page is live.",
    );
    router.refresh();
  }

  const publishLabel = isTournament ? "Open registration" : "Publish";
  const unpublishLabel = isTournament ? "Close registration" : "Unpublish";

  return (
    <div className="flex items-center gap-2">
      {published && (
        <Button asChild variant="outline" size="sm">
          <Link href={`${basePath}/${slug}`} target="_blank">
            <ExternalLink />
            View public page
          </Link>
        </Button>
      )}
      {published ? (
        // Taking the public page offline is guarded — a stray click by a
        // co-organizer shouldn't pull the league down.
        <ConfirmDialog
          title={
            isTournament ? "Close registration?" : "Unpublish this league?"
          }
          description={
            isTournament
              ? "The public registration/schedule page goes offline and teams can no longer sign up. You can reopen it anytime."
              : "The public schedule/standings page goes offline for players. You can publish it again anytime."
          }
          confirmLabel={unpublishLabel}
          onConfirm={run}
          trigger={
            <Button variant="outline" disabled={pending}>
              <EyeOff />
              {unpublishLabel}
            </Button>
          }
        />
      ) : (
        <Button onClick={() => startTransition(run)} disabled={pending}>
          <Globe />
          {pending ? "…" : publishLabel}
        </Button>
      )}
    </div>
  );
}
