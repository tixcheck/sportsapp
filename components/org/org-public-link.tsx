"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * The one link an organizer hands out.
 *
 * Every league already has its own sign-up link, and an organizer running four
 * of them was handing out four — which go stale the moment a season turns
 * over. This one lists whatever is open at the time, so a poster or a
 * newsletter printed once keeps working.
 *
 * Built from the current origin at click time rather than a configured base
 * URL, so it is right on localhost, on a preview deploy and in production
 * without anything to keep in step.
 */
export function OrgPublicLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/o/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Public link copied — this is the one to share.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (permissions, or an insecure context). Show
      // the link so it can still be copied by hand.
      toast.error(`Copy failed — the link is ${url}`);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
        {copied ? "Copied" : "Copy public link"}
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link href={`/o/${slug}`} target="_blank" rel="noreferrer">
          <ExternalLink className="size-4" />
          View public page
        </Link>
      </Button>
    </div>
  );
}
