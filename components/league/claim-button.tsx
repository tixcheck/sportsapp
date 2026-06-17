"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { claimTeamAction } from "@/server/actions/teams";
import { Button } from "@/components/ui/button";

export function ClaimButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function claim() {
    startTransition(async () => {
      const result = await claimTeamAction(token);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("You're now the captain. Welcome aboard!");
      router.push("/dashboard");
    });
  }

  return (
    <Button onClick={claim} disabled={pending} className="w-full">
      {pending ? "Claiming…" : "Claim your team"}
    </Button>
  );
}
