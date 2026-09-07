"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { inviteTeammateAction } from "@/server/actions/teams";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Row = { name: string; email: string; state: "new" | "sent" | "failed" };

/**
 * The last step: name your teammates so they get invited.
 *
 * Deliberately AFTER payment in the stepped flow. A captain who abandons at
 * PayPal would otherwise leave a handful of half-invited strangers behind,
 * holding a spot in a league they were never told about — and captains
 * routinely don't know their sixth player on the day they sign up.
 *
 * Invites are sent one at a time and each row keeps its own outcome, because
 * one bad address should not discard the five good ones typed beside it. A row
 * that fails stays editable; a row that succeeds locks.
 */
export function AddTeammates({
  teamId,
  /** How many players the roster wants in total, captain included. */
  rosterSize,
  waiverRequired,
  onDone,
  doneHref,
}: {
  teamId: string;
  rosterSize: number;
  waiverRequired: boolean;
  onDone?: () => void;
  doneHref?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Captain is already on the roster, so this asks for the rest.
  const blanks = Math.max(1, rosterSize - 1);
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: blanks }, () => ({
      name: "",
      email: "",
      state: "new" as const,
    })),
  );

  const set = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  const sent = rows.filter((r) => r.state === "sent").length;

  function sendAll() {
    const toSend = rows
      .map((r, i) => ({ ...r, i }))
      .filter((r) => r.state !== "sent" && r.email.trim() !== "");

    if (toSend.length === 0) {
      toast.error("Add at least one email, or skip for now.");
      return;
    }

    start(async () => {
      let failures = 0;
      for (const row of toSend) {
        const res = await inviteTeammateAction(
          teamId,
          row.email.trim(),
          row.name.trim() || undefined,
        );
        if ("error" in res) {
          failures++;
          set(row.i, { state: "failed" });
        } else {
          set(row.i, { state: "sent" });
        }
      }

      if (failures === 0) {
        toast.success(
          toSend.length === 1
            ? "Invite sent."
            : `${toSend.length} invites sent.`,
        );
      } else {
        toast.error(
          `${failures} of ${toSend.length} couldn't be sent — check those addresses.`,
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm font-medium">Add your teammates</p>
        <p className="text-muted-foreground mt-1 text-sm">
          They&apos;ll get an email inviting them to join
          {waiverRequired ? " and sign the waiver" : ""}. You can add more later
          from your team page.
        </p>
      </div>

      <div className="grid gap-2">
        {rows.map((row, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.3fr_auto]">
            <Input
              placeholder={`Player ${i + 2} name`}
              value={row.name}
              disabled={row.state === "sent"}
              onChange={(e) => set(i, { name: e.target.value })}
            />
            <Input
              type="email"
              inputMode="email"
              placeholder="Email"
              value={row.email}
              disabled={row.state === "sent"}
              onChange={(e) => set(i, { email: e.target.value, state: "new" })}
              aria-invalid={row.state === "failed"}
            />
            <span className="text-muted-foreground flex items-center text-xs">
              {row.state === "sent" && (
                <span className="text-pine inline-flex items-center gap-1">
                  <Check className="size-4" />
                  Invited
                </span>
              )}
              {row.state === "failed" && (
                <span className="text-destructive">Couldn&apos;t send</span>
              )}
            </span>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() =>
          setRows((r) => [...r, { name: "", email: "", state: "new" }])
        }
      >
        <UserPlus className="size-4" />
        Add another
      </Button>

      {waiverRequired && (
        <p className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
          Your team joins the schedule once <strong>everyone</strong> has signed
          the waiver — including you. Until then it stays pending, so it&apos;s
          worth nudging anyone who hasn&apos;t.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={sendAll} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? "Sending…" : sent > 0 ? "Send the rest" : "Send invites"}
        </Button>

        {(doneHref || onDone) &&
          (doneHref ? (
            <Button asChild variant="ghost">
              <a href={doneHref}>{sent > 0 ? "Done" : "I'll do this later"}</a>
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={onDone}>
              {sent > 0 ? "Done" : "I'll do this later"}
            </Button>
          ))}
      </div>
    </div>
  );
}
