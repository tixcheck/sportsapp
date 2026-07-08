"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, EyeOff, Globe, UserPlus, UserX } from "lucide-react";
import { toast } from "sonner";

import {
  publishTournamentAction,
  unpublishTournamentAction,
  setTournamentRegistrationAction,
} from "@/server/actions/tournaments";
import { Button } from "@/components/ui/button";

/**
 * Publishing (public page live) and self-registration are separate: an organizer
 * who registered every team can share the schedule with registration closed.
 * Publish = visibility; registration = status.
 */
export function TournamentPublishControls({
  competitionId,
  slug,
  status,
  visibility,
}: {
  competitionId: string;
  slug: string;
  status: string;
  visibility: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const published = visibility === "public";
  const registrationOpen = status === "open";

  function togglePublish() {
    start(async () => {
      const res = published
        ? await unpublishTournamentAction(competitionId)
        : await publishTournamentAction(competitionId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        published
          ? "Unpublished — the public page is offline."
          : "Published — the public page is live.",
      );
      router.refresh();
    });
  }

  function toggleRegistration() {
    start(async () => {
      const res = await setTournamentRegistrationAction(
        competitionId,
        !registrationOpen,
      );
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        registrationOpen
          ? "Registration closed."
          : "Registration open — teams can sign up on the public page.",
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {published && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/t/${slug}`} target="_blank">
            <ExternalLink />
            View public page
          </Link>
        </Button>
      )}
      <Button
        onClick={togglePublish}
        disabled={pending}
        variant={published ? "outline" : "default"}
        size="sm"
      >
        {published ? <EyeOff /> : <Globe />}
        {published ? "Unpublish" : "Publish"}
      </Button>
      <Button
        onClick={toggleRegistration}
        disabled={pending}
        variant="outline"
        size="sm"
      >
        {registrationOpen ? <UserX /> : <UserPlus />}
        {registrationOpen ? "Close registration" : "Open registration"}
      </Button>
    </div>
  );
}
