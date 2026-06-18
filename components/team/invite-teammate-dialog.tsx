"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import { inviteTeammateAction } from "@/server/actions/teams";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/league/copy-button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InviteTeammateDialog({
  teamId,
  teamName,
  variant = "outline",
  size = "sm",
}: {
  teamId: string;
  teamName: string;
  variant?: "outline" | "ghost";
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function invite() {
    start(async () => {
      const res = await inviteTeammateAction(teamId, email.trim());
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setLink(res.claimUrl);
      setEmail("");
      toast.success(
        res.emailSent
          ? "Invite sent — they'll get a link to join."
          : "Invite created — copy the link to share it.",
      );
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setLink(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={variant} size={size}>
          <UserPlus />
          Invite teammate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a teammate to {teamName}</DialogTitle>
          <DialogDescription>
            They&apos;ll join the roster as a player (not a scorer). Send as
            many as you need.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`tm-${teamId}`}>Player email</Label>
          <Input
            id={`tm-${teamId}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="player@example.com"
          />
          {link && (
            <div className="mt-2 flex items-center gap-2">
              <CopyButton value={link} label="Copy claim link" />
              <span className="text-muted-foreground text-xs">
                Last invite&apos;s link
              </span>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Done
            </Button>
          </DialogClose>
          <Button onClick={invite} disabled={pending || !email.trim()}>
            {pending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
