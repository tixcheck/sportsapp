"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { toast } from "sonner";

import type { RemovedSignup } from "@/lib/queries/removed-signups";
import { updateRemovedSignupNoteAction } from "@/server/actions/free-agents";
import { formatCents } from "@/lib/payments/format";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function Entry({
  entry,
  timezone,
  currency,
}: {
  entry: RemovedSignup;
  timezone: string;
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.note ?? "");

  function save() {
    start(async () => {
      const res = await updateRemovedSignupNoteAction({
        removedSignupId: entry.id,
        note: draft,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setEditing(false);
      toast.success(draft.trim() === "" ? "Note cleared." : "Note saved.");
      router.refresh();
    });
  }

  const when = DateTime.fromISO(entry.removedAt, { zone: timezone }).toFormat(
    "d LLL yyyy",
  );

  return (
    <li className="border-rule space-y-2 border-b py-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{entry.name}</p>
          {entry.email && (
            <p className="text-muted-foreground truncate text-xs">
              {entry.email}
            </p>
          )}
        </div>
        <div className="text-right">
          {/* What they had actually paid, after refunds — the figure that makes
              this record worth keeping at all. */}
          <p className="text-sm font-semibold tabular-nums">
            {entry.paidCents > 0
              ? formatCents(entry.paidCents, currency)
              : "Never paid"}
          </p>
          <p className="text-muted-foreground text-xs">
            Removed {when}
            {entry.paymentMethods.length > 0 &&
              ` · ${entry.paymentMethods.join(", ")}`}
          </p>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          {/* A raw textarea with the shared classes — there is no ui/textarea
              primitive, and nine other places in the app style it this way. */}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            rows={3}
            maxLength={2000}
            placeholder="Why they left, whether they were refunded…"
            aria-label={`Note about ${entry.name}`}
            className="border-input bg-surface focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setDraft(entry.note ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-ink-2 min-w-0 flex-1 text-xs whitespace-pre-wrap">
            {entry.note ?? (
              <span className="text-ink-3 italic">No note yet.</span>
            )}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground shrink-0 px-2 text-xs"
            onClick={() => setEditing(true)}
          >
            {entry.note ? "Edit note" : "Add note"}
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * Sign-ups an organizer removed, and why (migration 0127).
 *
 * Removing an individual deletes their `registration_payments` rows by cascade,
 * so this is the only surviving trace that the person — and their fee — were
 * ever here. BVL removes people who withdrew and refunds them through their own
 * PayPal; the note is where that gets said, and it is editable because the
 * reason is usually known after the removal rather than during it.
 *
 * Organizer-only by RLS, not by this component: the table's select policy is
 * `is_org_admin`, so anyone else reads an empty list.
 */
export function RemovedSignupsCard({
  entries,
  timezone,
  currency = "CAD",
}: {
  entries: RemovedSignup[];
  timezone: string;
  currency?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Removed sign-ups</CardTitle>
        <CardDescription>
          {entries.length === 0
            ? "Anyone you remove from the free agents list is kept here."
            : `${entries.length} removed. Their sign-up and payment rows were deleted — this is the record of what was there.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nobody removed yet.</p>
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry) => (
              <Entry
                key={entry.id}
                entry={entry}
                timezone={timezone}
                currency={currency}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
