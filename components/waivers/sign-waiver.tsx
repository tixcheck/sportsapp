"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { signWaiverAction } from "@/server/actions/waivers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Read the waiver, then agree to it.
 *
 * Two deliberate frictions. The agree control stays disabled until the text has
 * actually been scrolled to the end, because "I have read and agree" under a
 * box nobody opened is the part that falls over when it matters. And agreeing
 * means typing your name rather than ticking a box — a signature is a positive
 * act, and the typed name is what the record stores.
 *
 * The checksum of the text shown here is sent back and verified server-side
 * against the stored waiver, so a tab left open across a new version cannot
 * record agreement to wording that was never on screen.
 */
export function SignWaiver({
  competitionId,
  competitionName,
  waiverId,
  title,
  body,
  bodySha256,
  suggestedName,
}: {
  competitionId: string;
  competitionName: string;
  waiverId: string;
  title: string;
  body: string;
  bodySha256: string;
  /** Their display name, offered as a starting point. */
  suggestedName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [readToEnd, setReadToEnd] = useState(false);
  const [name, setName] = useState(suggestedName);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    // A small tolerance: sub-pixel heights mean the exact bottom is rarely hit.
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 24)
      setReadToEnd(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await signWaiverAction({
        competitionId,
        waiverId,
        signedName: name,
        bodySha256,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Thanks — that's recorded.");
      router.refresh();
    });
  }

  return (
    <section className="border-claret/40 bg-claret-tint/30 rounded-xl border p-5">
      <p className="text-claret flex items-center gap-2 text-xs font-semibold tracking-[0.16em] uppercase">
        <ShieldCheck className="size-4" />
        Before you play
      </p>

      <h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="text-ink-2 mt-1 text-sm">
        {competitionName} needs this from every player. Your team isn&rsquo;t
        confirmed until everyone on it has agreed.
      </p>

      <div
        onScroll={onScroll}
        className="border-rule bg-surface text-ink-2 mt-4 max-h-64 overflow-y-auto rounded-lg border p-4 text-sm leading-relaxed whitespace-pre-wrap"
      >
        {body}
      </div>

      {!readToEnd && (
        <p className="text-ink-3 mt-2 text-xs">
          Scroll to the end of the waiver to continue.
        </p>
      )}

      <form onSubmit={submit} className="mt-4 grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="waiver-sign">Type your full name to agree</Label>
          <Input
            id="waiver-sign"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!readToEnd}
            autoComplete="name"
            placeholder="Your full name"
            className={cn(!readToEnd && "opacity-60")}
          />
        </div>

        <Button
          type="submit"
          disabled={pending || !readToEnd || name.trim().length < 2}
          className="justify-self-start"
        >
          {pending ? "Recording…" : "I agree"}
        </Button>
      </form>

      <p className="text-ink-3 mt-3 text-xs">
        We record your name, the date, and the exact wording you agreed to. It
        can be seen by you and by the organizer of this competition, and nobody
        else.
      </p>
    </section>
  );
}
