import type {
  IndividualLedger,
  IndividualLedgerRow,
} from "@/lib/payments/individual-ledger";
import { formatCents } from "@/lib/payments/format";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

const STATE_LABEL: Record<IndividualLedgerRow["state"], string> = {
  unpaid: "Unpaid",
  partial: "Part paid",
  paid: "Paid",
  free: "Free",
};

function SignupRow({
  row,
  currency,
}: {
  row: IndividualLedgerRow;
  currency: string;
}) {
  const withdrawn = row.status === "withdrawn";
  return (
    <div
      className={cn(
        "border-rule flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-3 py-2.5 last:border-0",
        withdrawn && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {row.name}
          {withdrawn && (
            <span className="bg-paper-sunken text-ink-2 ml-2 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
              Withdrawn
            </span>
          )}
        </p>
        {row.email && (
          <p className="text-muted-foreground truncate text-xs">{row.email}</p>
        )}
        {/* A started-but-unconfirmed payment is not money, and the organizer
            settles it in the offline inbox — so point them there rather than
            leaving an unexplained "Unpaid" beside someone who has paid. */}
        {row.pendingCharges > 0 && (
          <p className="text-xs text-amber-700">
            Says they&apos;ve paid — confirm it in Offline payments.
          </p>
        )}
      </div>

      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">
          {formatCents(row.collectedPriceCents, currency)}
        </p>
        <p
          className={cn(
            "text-xs",
            row.state === "unpaid" || row.state === "partial"
              ? "text-amber-700"
              : "text-muted-foreground",
          )}
        >
          {STATE_LABEL[row.state]}
          {row.outstandingPriceCents > 0 &&
            ` · ${formatCents(row.outstandingPriceCents, currency)} owing`}
          {row.refundedCents > 0 &&
            ` · ${formatCents(row.refundedCents, currency)} back`}
        </p>
      </div>
    </div>
  );
}

/**
 * What each free agent has paid — the panel individuals never had.
 *
 * `PaymentsDashboard` groups charges by team, and an individual's charge has no
 * team, so they appeared in no payments screen at all once their payment was
 * confirmed. BVL's organizer: "I can only seem to find payment records for
 * team, and not INDY player/registrants."
 *
 * A Server Component for the same reason the team dashboard is one: every
 * amount is computed on the server and only read here.
 *
 * There is deliberately **no refund control**. These fees are taken
 * off-platform, so a refund happens in the organizer's own PayPal — the app
 * never touched the money and should not imply it can send it back.
 */
export function IndividualPaymentsCard({
  ledger,
  currency = "CAD",
}: {
  ledger: IndividualLedger;
  currency?: string;
}) {
  const { signups, totals, feeCents } = ledger;
  const isPaid = feeCents > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Individual payments</CardTitle>
        <CardDescription>
          {isPaid
            ? `${formatCents(feeCents, currency)} per person signing up without a team.`
            : "Individual sign-ups are free for this event."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {isPaid && signups.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <Stat
              label="Collected"
              value={formatCents(totals.collectedPriceCents, currency)}
              hint={
                totals.refundedCents > 0
                  ? `${formatCents(totals.refundedCents, currency)} refunded`
                  : `${totals.paid} of ${totals.counted} paid`
              }
            />
            <Stat
              label="Outstanding"
              value={formatCents(totals.outstandingPriceCents, currency)}
              hint={
                totals.unpaid + totals.partial > 0
                  ? `${totals.unpaid + totals.partial} still to pay`
                  : "Everyone's paid"
              }
            />
          </div>
        )}

        {signups.length === 0 ? (
          <div className="border-border rounded-lg border border-dashed px-4 py-8 text-center">
            <p className="text-sm font-medium">No individual sign-ups yet</p>
            <p className="text-muted-foreground mt-1 text-xs">
              People who register without a team appear here with what they owe
              and what they&apos;ve paid.
            </p>
          </div>
        ) : (
          <div className="border-border overflow-hidden rounded-lg border">
            {signups.map((row) => (
              <SignupRow key={row.freeAgentId} row={row} currency={currency} />
            ))}
          </div>
        )}

        {isPaid && signups.length > 0 && (
          <p className="text-muted-foreground text-xs">
            Refunds for a fee paid by PayPal or e-transfer are sent from your
            own account — the record here stays as it is. Use Withdraw on the
            Free agents card to take someone out of the pool.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
