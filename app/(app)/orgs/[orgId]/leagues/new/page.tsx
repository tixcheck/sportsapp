import Link from "next/link";
import { notFound } from "next/navigation";

import { getOrg } from "@/lib/queries/leagues";
import { LeagueWizard } from "@/components/league/league-wizard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function NewLeaguePage({
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
          <CardTitle>New league</CardTitle>
          <CardDescription>
            Set it up step by step. You can add teams and generate the schedule
            next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeagueWizard orgId={orgId} />
        </CardContent>
      </Card>
    </div>
  );
}
