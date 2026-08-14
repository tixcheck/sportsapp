"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { updateEventBlurbAction } from "@/server/actions/event-page";
import { toParagraphs } from "@/lib/email/broadcast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * What the registration page says about this event.
 *
 * Plain text on purpose — blank lines make paragraphs, and emoji work fine, so
 * an organizer can get most of the look of a formatted pitch without the app
 * accepting markup on a public page.
 */
export function EventBlurbCard({
  competitionId,
  registerPath,
  initial,
}: {
  competitionId: string;
  /** Where the result is visible, so the organizer can go and look. */
  registerPath: string;
  initial: { description: string | null; bannerUrl: string | null };
}) {
  const router = useRouter();
  const [description, setDescription] = useState(initial.description ?? "");
  const [bannerUrl, setBannerUrl] = useState(initial.bannerUrl ?? "");
  const [pending, start] = useTransition();

  const dirty =
    description !== (initial.description ?? "") ||
    bannerUrl !== (initial.bannerUrl ?? "");
  const paragraphs = toParagraphs(description).length;

  function save() {
    start(async () => {
      const res = await updateEventBlurbAction({
        competitionId,
        description: description.trim(),
        bannerUrl: bannerUrl.trim(),
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Registration page updated.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration page</CardTitle>
        <CardDescription>
          What teams see before they sign up. The dates, venue, entry fee,
          format and spots left are filled in automatically — this is the part
          only you can write.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="event-description">About this event</Label>
          <textarea
            id="event-description"
            className="border-border bg-surface min-h-40 w-full rounded-md border px-3 py-2 text-sm leading-relaxed"
            value={description}
            maxLength={4000}
            placeholder={
              "Who it's for, what the format feels like, anything a captain should know before entering.\n\nLeave a blank line between paragraphs. Emoji are fine ✨"
            }
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {description.length}/4000 · {paragraphs} paragraph
            {paragraphs === 1 ? "" : "s"} · plain text only, so nothing can
            break the page
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="event-banner">Banner image link</Label>
          <Input
            id="event-banner"
            value={bannerUrl}
            maxLength={500}
            placeholder="https://…/your-banner.jpg"
            onChange={(e) => setBannerUrl(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Paste a link to an image you already host. Uploads aren&apos;t
            supported yet — a wide image (about 3:1) sits best.
          </p>
          {bannerUrl.trim() !== "" &&
            /^https?:\/\//i.test(bannerUrl.trim()) && (
              // eslint-disable-next-line @next/next/no-img-element -- external URL preview
              <img
                src={bannerUrl.trim()}
                alt=""
                className="border-border mt-2 h-24 w-full rounded-md border object-cover"
              />
            )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={registerPath} target="_blank" rel="noreferrer">
              Preview
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
