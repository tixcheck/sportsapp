import Link from "next/link";
import { notFound } from "next/navigation";

import { getOrg } from "@/lib/queries/leagues";
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
          <TournamentWizard orgId={orgId} />
        </CardContent>
      </Card>
    </div>
  );
}
