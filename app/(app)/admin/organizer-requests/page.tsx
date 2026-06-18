import { notFound } from "next/navigation";
import { DateTime } from "luxon";

import {
  getAccessState,
  getPendingOrganizerRequests,
} from "@/lib/queries/access";
import { OrganizerRequestActions } from "@/components/admin/organizer-request-actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function OrganizerRequestsPage() {
  // Platform-admin only — the decide rpc is independently gated, this guards
  // the page itself.
  const access = await getAccessState();
  if (!access.isPlatformAdmin) notFound();

  const requests = await getPendingOrganizerRequests();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight">
          Organizer requests
        </h1>
        <p className="text-muted-foreground text-sm">
          Approve to grant organization-creation access.
        </p>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No pending requests.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="text-base">{r.userName}</CardTitle>
                <CardDescription>
                  {r.userEmail} · requested{" "}
                  {DateTime.fromISO(r.requestedAt).toFormat("LLL d, yyyy")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  {r.note ? (
                    <span className="text-muted-foreground italic">
                      “{r.note}”
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No note.</span>
                  )}
                </p>
                <OrganizerRequestActions
                  requestId={r.id}
                  userName={r.userName}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
