"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Sport } from "@/lib/formats";
import type { FreeAgent } from "@/lib/queries/free-agents";
import { updateFreeAgentDetailsAction } from "@/server/actions/free-agents";
import {
  SignupDetailsFields,
  toSignupDetails,
  type SignupDetails,
} from "@/components/registration/signup-details-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Edit one individual's sign-up details from the Free agents card.
 *
 * Details only — the league's questions are edited from the Players tab, which
 * loads them; the pool is where an organizer is placing people, and a spelling
 * or phone fix shouldn't mean leaving it.
 */
export function EditSignupDialog({
  agent,
  sport,
  onClose,
}: {
  agent: FreeAgent;
  sport: Sport;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [details, setDetails] = useState<SignupDetails>(() =>
    toSignupDetails(agent),
  );

  function save() {
    start(async () => {
      const res = await updateFreeAgentDetailsAction({
        freeAgentId: agent.id,
        ...details,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Saved ${details.name}.`);
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{agent.name}</DialogTitle>
          <DialogDescription>
            {agent.placedTeamName ??
              (agent.status === "pending_payment"
                ? "Individual · hasn't paid yet"
                : "Individual — not on a team yet")}
          </DialogDescription>
        </DialogHeader>

        <SignupDetailsFields
          sport={sport}
          value={details}
          onChange={setDetails}
          disabled={pending}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
