"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { decideOrganizerRequestAction } from "@/server/actions/organizer";
import { Button } from "@/components/ui/button";

export function OrganizerRequestActions({
  requestId,
  userName,
}: {
  requestId: string;
  userName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function decide(approve: boolean) {
    start(async () => {
      const res = await decideOrganizerRequestAction(requestId, approve);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        approve ? `${userName} is now an organizer.` : "Request denied.",
      );
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => decide(false)}
        disabled={pending}
      >
        Deny
      </Button>
      <Button size="sm" onClick={() => decide(true)} disabled={pending}>
        Approve
      </Button>
    </div>
  );
}
