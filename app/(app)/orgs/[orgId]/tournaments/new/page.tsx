import Link from "next/link";
import { notFound } from "next/navigation";

import { getOrg } from "@/lib/queries/leagues";
import { getPaymentAccount } from "@/lib/queries/payments";
import { paymentAccountStatus } from "@/lib/payments/account-status";
import { TournamentWizard } from "@/components/tournament/tournament-wizard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function NewTournamentPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const org = await getOrg(orgId);
  if (!org) notFound();

  // Drives the fee preview: an org with no Stripe is quoted what the payer
  // sends them directly, with no deduction line that will never apply.
  const payoutsReady = paymentAccountStatus(
    await getPaymentAccount(orgId),
  ).canAcceptPayments;

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href={`/orgs/${orgId}`}
        className="text-muted-foreground text-sm hover:underline"
      >
        ← Back to {org.name}
      </Link>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>New tournament</CardTitle>
          <CardDescription>
            Set it up, then open registration so teams can sign up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TournamentWizard orgId={orgId} payoutsReady={payoutsReady} />
        </CardContent>
      </Card>
    </div>
  );
}
