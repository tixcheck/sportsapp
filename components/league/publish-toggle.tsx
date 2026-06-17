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

  function toggle() {
    startTransition(async () => {
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
    });
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
      <Button
        onClick={toggle}
        disabled={pending}
        variant={published ? "outline" : "default"}
      >
        {published ? <EyeOff /> : <Globe />}
        {pending ? "…" : published ? unpublishLabel : publishLabel}
      </Button>
    </div>
  );
}
