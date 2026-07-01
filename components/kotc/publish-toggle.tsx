"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Eye, EyeOff, QrCode } from "lucide-react";
import { toast } from "sonner";

import { setKotcVisibilityAction } from "@/server/actions/kotc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Organizer control: publish the read-only spectator page (sets the competition
 * public), copy its shareable link, and show a scannable QR code for participants.
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
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const isPublic = visibility === "public";
  const url = origin ? `${origin}/k/${slug}` : "";

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
        <>
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

          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <QrCode /> QR
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xs">
              <DialogHeader>
                <DialogTitle>Scan to view scores</DialogTitle>
                <DialogDescription>
                  Participants scan this to open the live spectator page.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3 py-2">
                {url && (
                  <div className="rounded-lg bg-white p-4">
                    <QRCodeSVG value={url} size={224} marginSize={0} />
                  </div>
                )}
                <span className="text-muted-foreground text-center text-xs break-all">
                  {url}
                </span>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
