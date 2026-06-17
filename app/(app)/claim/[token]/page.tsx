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
          <CardTitle>Claim your team</CardTitle>
          <CardDescription>
            You&apos;ve been invited to captain a team. Claim it to see your
            schedule, enter scores, and manage your roster.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClaimButton token={token} />
        </CardContent>
      </Card>
    </div>
  );
}
