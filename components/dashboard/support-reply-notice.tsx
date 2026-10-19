"use client";

import { useState } from "react";
import { LifeBuoy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OPEN_SUPPORT_EVENT } from "@/components/support/support-chat";

/**
 * "You have a reply" at the top of the dashboard. The dot on the Help button
 * is easy to miss; this isn't. Opening Help marks the reply read, so the card
 * hides itself here and is gone on the next load.
 */
export function SupportReplyNotice({ preview }: { preview: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <section className="border-claret/30 bg-claret/5 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <LifeBuoy className="text-claret mt-0.5 size-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">
            You have a reply from the MySportsApp team
          </p>
          <p className="text-muted-foreground line-clamp-2 text-sm">
            {preview}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        className="shrink-0"
        onClick={() => {
          window.dispatchEvent(new Event(OPEN_SUPPORT_EVENT));
          setHidden(true);
        }}
      >
        Open Help
      </Button>
    </section>
  );
}
