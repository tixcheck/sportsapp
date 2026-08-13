import type { CompetitionLedger } from "@/lib/payments/ledger";
import { formatCents } from "@/lib/payments/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AddTeamDialog } from "@/components/payments/add-team-dialog";
import { PaymentTeamRow } from "@/components/payments/payment-team-row";

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

/**
 * The organizer's money panel: what's landed, what's outstanding, and who to
 * chase.
 *
 * A Server Component — every number comes from the ledger already computed on
 * the server, and only the per-team actions are interactive. That keeps the
 * amounts out of reach of the client entirely.
 *
 * "Collected" is what the organizer NETS, not what payers were charged. Those
 * differ under pass-through pricing, and the organizer's number is the one they
 * care about; the gross is shown as a hint so the two are never confused.
 */
export function PaymentsDashboard({
  competitionId,
  ledger,
  currency = "CAD",
  payoutsReady,
  splitAllowed,
}: {
  competitionId: string;
  ledger: CompetitionLedger;
  currency?: string;
  /** Whether the org's Stripe account can actually take money yet. */
  payoutsReady: boolean;
  splitAllowed: boolean;
}) {
  const { totals, teams, feeCents } = ledger;
  const isPaid = feeCents > 0;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Payments</CardTitle>
          <CardDescription>
            {isPaid
              ? `${formatCents(feeCents, currency)} per team. You net the full amount — payers cover the fees.`
              : "This event is free. Teams are listed here so you can add and manage them."}
          </CardDescription>
        </div>
        <AddTeamDialog
          competitionId={competitionId}
          isPaid={isPaid}
          splitAllowed={splitAllowed}
        />
      </CardHeader>

      <CardContent className="space-y-5">
        {isPaid && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label="Collected"
                value={formatCents(totals.collectedPriceCents, currency)}
                hint={`${formatCents(totals.grossChargedCents, currency)} charged in total`}
              />
              <Stat
                label="Outstanding"
                value={formatCents(totals.outstandingPriceCents, currency)}
                hint={
                  totals.teamsUnpaid + totals.teamsPartial > 0
                    ? `${totals.teamsUnpaid + totals.teamsPartial} of ${totals.teamsCounted} teams`
                    : "Everyone's paid"
                }
              />
              <Stat
                label="Tax collected"
                value={formatCents(totals.collectedTaxCents, currency)}
                hint="Yours to remit"
              />
              <Stat
                label="Refunded"
                value={formatCents(totals.refundedCents, currency)}
                hint={
                  totals.refundedCents > 0
                    ? "Returned to payers"
                    : "Nothing sent back"
                }
              />
            </div>

            {!payoutsReady && (
              <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900">
                Your Stripe account isn&apos;t ready to take payments yet, so
                nobody can pay online. Finish payouts setup on your organization
                page.
              </p>
            )}
          </>
        )}

        {teams.length === 0 ? (
          <div className="border-border rounded-lg border border-dashed px-4 py-8 text-center">
            <p className="text-sm font-medium">No teams yet</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Teams appear here as they register — or add one yourself.
            </p>
          </div>
        ) : (
          <div className="border-border overflow-hidden rounded-lg border">
            {teams.map((team) => (
              <PaymentTeamRow
                key={team.teamId}
                team={team}
                currency={currency}
              />
            ))}
          </div>
        )}

        {isPaid && (
          <p className="text-muted-foreground text-xs">
            Platform fee so far:{" "}
            {formatCents(totals.platformFeeCents, currency)}. Payouts land in
            your Stripe account about two business days after each payment.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
