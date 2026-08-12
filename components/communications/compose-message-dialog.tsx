"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Send } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { sendOrgMessageAction } from "@/server/actions/communications";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type MessageableCompetition = {
  id: string;
  name: string;
  type: "league" | "tournament" | "kotc";
};

/**
 * Compose one message to everyone in the chosen events.
 *
 * Deliberately a two-step feel: pick who, write what, and only then a send
 * button that says how many people it's about to email. A broadcast can't be
 * unsent, so the count is the last thing they read before clicking.
 */
export function ComposeMessageDialog({
  orgId,
  competitions,
}: {
  orgId: string;
  competitions: MessageableCompetition[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [selected, setSelected] = useState<string[]>([]);
  const [audience, setAudience] = useState<"players" | "captains">("players");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const canSend =
    selected.length > 0 &&
    subject.trim().length >= 3 &&
    body.trim().length >= 10;

  function toggle(id: string) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }

  function send() {
    start(async () => {
      const res = await sendOrgMessageAction(orgId, {
        competitionIds: selected,
        subject,
        body,
        audience,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.failed > 0
          ? `Sent to ${res.sent} — ${res.failed} couldn't be delivered.`
          : `Sent to ${res.sent} ${res.sent === 1 ? "person" : "people"}.`,
      );
      setOpen(false);
      setSelected([]);
      setSubject("");
      setBody("");
      router.refresh();
    });
  }

  if (competitions.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Send className="size-4" />
          Send a message
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a message</DialogTitle>
          <DialogDescription>
            Goes to everyone playing in the events you pick. They can reply
            straight to you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Which events?</Label>
            <div className="max-h-48 space-y-1.5 overflow-y-auto">
              {competitions.map((c) => {
                const on = selected.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg border p-2.5 text-left transition-colors",
                      on
                        ? "border-primary bg-accent"
                        : "border-border bg-surface hover:bg-muted",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {c.name}
                      </span>
                      <span className="text-muted-foreground text-xs capitalize">
                        {c.type}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-md border",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {on && <Check className="size-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Who in those events?</Label>
            <div className="flex gap-2">
              {(
                [
                  ["players", "Everyone"],
                  ["captains", "Captains only"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAudience(value)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    audience === value
                      ? "border-primary bg-accent font-medium"
                      : "border-border bg-surface hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              maxLength={200}
              placeholder="Courts moved to Gym B this week"
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body">Message</Label>
            <textarea
              id="body"
              value={body}
              maxLength={10_000}
              rows={7}
              placeholder={
                "Hi everyone,\n\nWe're in Gym B for Tuesday only — same time, same courts.\n\nSee you there."
              }
              onChange={(e) => setBody(e.target.value)}
              className="border-border bg-surface focus-visible:ring-ring w-full rounded-lg border p-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
            <p className="text-muted-foreground text-xs">
              Plain text only. Blank lines become paragraphs. Everyone gets
              their own copy — nobody sees anyone else&apos;s address.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!canSend || pending}>
            {pending
              ? "Sending…"
              : `Send to ${selected.length === 0 ? "…" : audience === "captains" ? "captains" : "everyone"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
