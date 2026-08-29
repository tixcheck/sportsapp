"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Link as LinkIcon, Lock } from "lucide-react";
import { toast } from "sonner";

import {
  publishReversePairsAction,
  unpublishReversePairsAction,
} from "@/server/actions/reverse-pairs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The public page, on or off.
 *
 * Published means genuinely public: a signed-out visitor can only read a
 * competition marked public, so anything less would 404 for exactly the people
 * the link was shared with.
 */
export function ReversePairsPublishCard({
  competitionId,
  slug,
  isPublic,
}: {
  competitionId: string;
  slug: string;
  isPublic: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [live, setLive] = useState(isPublic);
  const url = `/rp/${slug}`;

  function toggle() {
    start(async () => {
      const res = live
        ? await unpublishReversePairsAction(competitionId)
        : await publishReversePairsAction(competitionId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setLive(!live);
      toast.success(live ? "Public page taken offline." : "Published.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {live ? <Globe className="size-4" /> : <Lock className="size-4" />}
          {live ? "Published" : "Not published"}
        </CardTitle>
        <CardDescription>
          {live
            ? "Anyone with the link can see the schedule and standings."
            : "Only you and your org can see this. Publish to share it with the players."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Button
          onClick={toggle}
          disabled={pending}
          variant={live ? "outline" : "default"}
        >
          {pending ? "Saving…" : live ? "Take offline" : "Publish"}
        </Button>
        {live && (
          <Button asChild variant="outline">
            <a href={url} target="_blank" rel="noreferrer">
              <LinkIcon className="size-4" />
              View public page
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
