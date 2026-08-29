import { notFound } from "next/navigation";

import { getUserOrgs } from "@/lib/auth/user";
import { NewReversePairsForm } from "@/components/reverse-pairs/new-form";

export default async function NewReversePairsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const orgs = await getUserOrgs();
  const role = orgs.find((o) => o.id === orgId)?.role;
  if (role !== "owner" && role !== "admin") notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
          New Reverse Pairs event
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Pairs sign up together and stay a pair. Each game three pairs make a
          team of six against three others, and the draw gives everyone as many
          different teammates as the night allows.
        </p>
      </div>
      <NewReversePairsForm orgId={orgId} />
    </div>
  );
}
