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
import { Button } from "@/components/ui/button";

export function PublishToggle({
  competitionId,
  status,
  slug,
}: {
  competitionId: string;
  status: string;
  slug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const published = status === "open";

  function toggle() {
    startTransition(async () => {
      const result = published
        ? await unpublishLeagueAction(competitionId)
        : await publishLeagueAction(competitionId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        published
          ? "League unpublished — public page is offline."
          : "Published — the public page is live.",
      );
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {published && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/l/${slug}`} target="_blank">
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
        {pending ? "…" : published ? "Unpublish" : "Publish"}
      </Button>
    </div>
  );
}
