"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Copy the event's shareable sign-up link (/register/<slug>) to the clipboard —
 * the clean link organizers drop in a group chat or on a flyer, instead of the
 * full event page. Builds the URL from the current origin at click time.
 */
export function CopyRegistrationLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/register/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Sign-up link copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (permissions / insecure context) — show the
      // link so the organizer can copy it by hand.
      toast.error(`Copy failed — the link is ${url}`);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
      {copied ? "Copied" : "Copy sign-up link"}
    </Button>
  );
}
