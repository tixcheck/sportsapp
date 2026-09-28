import { ClaimButton } from "@/components/league/claim-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="mx-auto max-w-md py-8">
      <Card>
        <CardHeader>
          <CardTitle>Join your team</CardTitle>
          {/* Captains, teammates and Reverse Pairs partners all land here, so
              the copy can't assume which one — it once told every invitee
              they were the captain. */}
          <CardDescription>
            You&apos;ve been invited to a team. Accept to see your schedule,
            enter scores, and pay your share if there is one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClaimButton token={token} />
        </CardContent>
      </Card>
    </div>
  );
}
