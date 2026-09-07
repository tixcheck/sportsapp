"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { recordPayerReferenceAction } from "@/server/actions/organizer-payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Optional: the payer notes their PayPal transaction ID.
 *
 * It verifies nothing — we have no way to check it, and the copy says so
 * rather than implying this is a receipt. It exists because the organizer has
 * to find one payment among everything else in their PayPal account, and a
 * transaction ID turns that from a hunt into a search.
 *
 * Optional on purpose. Making it required would strand anyone who closed the
 * PayPal tab, and their team would sit unconfirmed over a field they can no
 * longer fill in.
 */
export function PayerReferenceForm({
  paymentId,
  initial,
}: {
  paymentId: string;
  initial: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reference, setReference] = useState(initial ?? "");
  const [saved, setSaved] = useState(!!initial);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await recordPayerReferenceAction({ paymentId, reference });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setSaved(true);
      toast.success("Noted — thanks, that helps them find it.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-2">
      <Label htmlFor="paypal-ref" className="text-sm font-medium">
        PayPal transaction ID{" "}
        <span className="text-muted-foreground font-normal">(optional)</span>
      </Label>
      <p className="text-muted-foreground text-xs">
        On your PayPal receipt. It helps the organizer find your payment faster
        — but they&rsquo;ll get there without it.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          id="paypal-ref"
          value={reference}
          onChange={(e) => {
            setReference(e.target.value);
            setSaved(false);
          }}
          placeholder="e.g. 8XW12345AB678901C"
          className="max-w-xs font-mono text-sm"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={pending || saved || reference.trim().length < 4}
        >
          {pending ? "Saving…" : saved ? "Saved" : "Save"}
        </Button>
      </div>
    </form>
  );
}
