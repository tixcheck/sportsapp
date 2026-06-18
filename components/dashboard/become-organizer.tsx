"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";

import { requestOrganizerAction } from "@/server/actions/organizer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export function BecomeOrganizer({
  status,
}: {
  status: "none" | "pending" | "approved";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  if (status === "approved") return null;
  if (status === "pending") {
    return (
      <div className="border-border bg-surface rounded-lg border p-4">
        <p className="text-sm font-medium">Organizer request pending</p>
        <p className="text-muted-foreground mt-1 text-sm">
          We&apos;ll let you know once it&apos;s reviewed. You can keep playing
          in the meantime.
        </p>
      </div>
    );
  }

  function submit() {
    start(async () => {
      const res = await requestOrganizerAction(note);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Request submitted — we'll review it soon.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">
          Want to run leagues or tournaments?
        </p>
        <p className="text-muted-foreground text-sm">
          Request organizer access to create your own organization.
        </p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <Megaphone />
            Become an organizer
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request organizer access</DialogTitle>
            <DialogDescription>
              Tell us a bit about what you want to run (optional). The platform
              admin will review your request.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="note">Note (optional)</Label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. I run a Tuesday-night indoor 6s league in the east end."
              className="border-border bg-surface focus-visible:ring-ring rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
