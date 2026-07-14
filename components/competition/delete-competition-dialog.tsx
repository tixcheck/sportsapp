"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteCompetitionAction } from "@/server/actions/competitions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Permanently deletes a competition, guarded by a type-the-name confirm so it
 * can't happen by accident. Shown only to org owners/admins (the page gates it),
 * and the delete RPC re-checks. On success, routes back to the org.
 */
export function DeleteCompetitionDialog({
  competitionId,
  name,
  orgId,
  kind,
}: {
  competitionId: string;
  name: string;
  orgId: string;
  kind: "league" | "tournament";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const armed = value.trim() === name.trim();
  const label = kind === "tournament" ? "tournament" : "league";

  function run() {
    if (!armed) return;
    start(async () => {
      const res = await deleteCompetitionAction(competitionId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`“${name}” deleted.`);
      router.push(`/orgs/${orgId}`);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (!o) setValue("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 />
          Delete {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{name}”?</DialogTitle>
          <DialogDescription>
            This permanently deletes the {label} and everything in it — teams,
            schedule, scores, and standings. This can&apos;t be undone. Type the{" "}
            {label} name to confirm.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={name}
          aria-label={`Type ${name} to confirm`}
          autoFocus
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={run}
            disabled={pending || !armed}
          >
            {pending ? "Deleting…" : `Delete ${label} permanently`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
