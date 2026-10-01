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
  pair = false,
}: {
  teamId: string;
  teamName: string;
  /**
   * A Reverse Pairs pair: one partner, asked for by name too, because the pair
   * is named after them ("Dani/TBD" becomes "Dani/Mel" as the invite goes out).
   */
  pair?: boolean;
  variant?: "outline" | "ghost";
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function invite() {
    start(async () => {
      const res = await inviteTeammateAction(
        teamId,
        email.trim(),
        name.trim() || undefined,
      );
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setLink(res.claimUrl);
      setEmail("");
      setName("");
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
          {pair ? "Invite partner" : "Invite teammate"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {pair ? "Invite your partner" : `Add a teammate to ${teamName}`}
          </DialogTitle>
          <DialogDescription>
            {pair
              ? "We'll email them a link to join your pair. Inviting someone new replaces an invite you've already sent."
              : "They'll join the roster as a player (not a scorer). Send as many as you need."}
          </DialogDescription>
        </DialogHeader>
        {pair && (
          <div className="grid gap-1.5">
            <Label htmlFor={`tm-name-${teamId}`}>Partner&apos;s name</Label>
            <Input
              id={`tm-name-${teamId}`}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mel Chan"
            />
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor={`tm-${teamId}`}>
            {pair ? "Partner's email" : "Player email"}
          </Label>
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
