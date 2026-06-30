"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { setKotcVisibilityAction } from "@/server/actions/kotc";
import { Button } from "@/components/ui/button";

/**
 * Organizer control: publish the read-only spectator page (sets the competition
 * public) and copy its shareable link. Private by default.
 */
export function PublishToggle({
  competitionId,
  slug,
  visibility,
}: {
  competitionId: string;
  slug: string;
  visibility: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const isPublic = visibility === "public";

  function toggle() {
    start(async () => {
      const res = await setKotcVisibilityAction({
        competitionId,
        isPublic: !isPublic,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.visibility === "public"
          ? "Spectator page is live — share the link."
          : "Spectator page hidden.",
      );
      router.refresh();
    });
  }

  function copy() {
    const url = `${window.location.origin}/k/${slug}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Link copied.");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={toggle} disabled={pending}>
        {isPublic ? <Eye /> : <EyeOff />}
        {pending ? "Saving…" : isPublic ? "Public" : "Make public"}
      </Button>
      {isPublic && (
        <button
          type="button"
          onClick={copy}
          className="border-border bg-surface text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          /k/{slug}
        </button>
      )}
    </div>
  );
}
