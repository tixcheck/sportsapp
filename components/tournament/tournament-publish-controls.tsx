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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Publishing (public page live) and self-registration are separate: an organizer
 * who registered every team can share the schedule with registration closed.
 * Publish = visibility; registration = status. The two "closing" directions
 * (unpublish, close registration) are guarded so a co-organizer can't take the
 * event offline by a stray click.
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

  async function runPublish() {
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
  }

  async function runRegistration() {
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
      {published ? (
        <ConfirmDialog
          title="Unpublish this tournament?"
          description="The public page goes offline for players. You can publish it again anytime."
          confirmLabel="Unpublish"
          onConfirm={runPublish}
          trigger={
            <Button variant="outline" size="sm" disabled={pending}>
              <EyeOff />
              Unpublish
            </Button>
          }
        />
      ) : (
        <Button onClick={() => start(runPublish)} disabled={pending} size="sm">
          <Globe />
          Publish
        </Button>
      )}
      {registrationOpen ? (
        <ConfirmDialog
          title="Close registration?"
          description="Teams can no longer sign up on the public page. You can reopen registration anytime."
          confirmLabel="Close registration"
          onConfirm={runRegistration}
          trigger={
            <Button variant="outline" size="sm" disabled={pending}>
              <UserX />
              Close registration
            </Button>
          }
        />
      ) : (
        <Button
          onClick={() => start(runRegistration)}
          disabled={pending}
          variant="outline"
          size="sm"
        >
          <UserPlus />
          Open registration
        </Button>
      )}
    </div>
  );
}
