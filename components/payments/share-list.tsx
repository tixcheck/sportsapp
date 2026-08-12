"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { startShareCheckoutAction } from "@/server/actions/registration-payments";
import type { MemberShare } from "@/lib/payments/registration-plan";
import { Button } from "@/components/ui/button";

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });

/**
 * Who on the roster has paid their share, and the button for the viewer to pay
 * theirs.
 *
 * The whole roster is listed, not just the viewer, because the social pressure
 * of a visible "still owing" column is what actually gets a team paid up — it's
 * the job an organizer currently does by hand in a WhatsApp thread.
 */
export function ShareList({
  competitionId,
  teamId,
  shares,
  viewerEmail,
  canPayOnline,
  isAdmin,
}: {
  competitionId: string;
  teamId: string;
  shares: MemberShare[];
  /** The signed-in user's email, to find their own row. */
  viewerEmail: string | null;
  canPayOnline: boolean;
  /** Organizers can settle a share on a player's behalf. */
  isAdmin: boolean;
}) {
  const [pending, start] = useTransition();

  if (shares.length === 0) return null;

  const viewer = viewerEmail?.trim().toLowerCase() ?? null;

  function pay(payerEmail?: string) {
    start(async () => {
      const res = await startShareCheckoutAction(
        competitionId,
        teamId,
        payerEmail,
      );
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      window.location.href = res.url;
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Everyone&apos;s share
      </p>

      <ul className="divide-border divide-y">
        {shares.map((s) => {
          const isViewer = viewer !== null && s.email.toLowerCase() === viewer;
          const settled = s.status === "paid";

          return (
            <li
              key={s.email}
              className="flex items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {s.name}
                  {isViewer && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      (you)
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">
                  {settled
                    ? "Paid"
                    : s.status === "pending"
                      ? "Checkout open"
                      : s.priceCents > 0
                        ? `Owes ${money(s.priceCents)}`
                        : "Nothing owing"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {settled ? (
                  <span className="grid size-5 place-items-center rounded-md bg-emerald-100 text-emerald-800">
                    <Check className="size-3.5" />
                  </span>
                ) : (
                  <span className="text-sm font-medium tabular-nums">
                    {s.totalCents !== null ? money(s.totalCents) : "—"}
                  </span>
                )}

                {!settled &&
                  canPayOnline &&
                  s.priceCents > 0 &&
                  (isViewer || isAdmin) && (
                    <Button
                      type="button"
                      size="sm"
                      variant={isViewer ? "default" : "outline"}
                      disabled={pending}
                      onClick={() => pay(isViewer ? undefined : s.email)}
                    >
                      {pending
                        ? "Opening…"
                        : isViewer
                          ? "Pay my share"
                          : "Pay for them"}
                    </Button>
                  )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground text-xs">
        Shares are split across everyone who has joined the team. If someone
        joins later, the remaining amount re-divides — nobody who has already
        paid is affected.
      </p>
    </div>
  );
}
