"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateScoringSettingsAction } from "@/server/actions/competitions";
import { Button } from "@/components/ui/button";
import { ScoringFields, type ScoringValue } from "./scoring-fields";

export function ScoringSettingsCard({
  competitionId,
  initial,
}: {
  competitionId: string;
  initial: ScoringValue;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<ScoringValue>(initial);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);

  function save() {
    startTransition(async () => {
      const result = await updateScoringSettingsAction(competitionId, value);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Scoring settings saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <ScoringFields value={value} onChange={setValue} />
      <Button onClick={save} disabled={pending || !dirty}>
        {pending ? "Saving…" : "Save scoring settings"}
      </Button>
    </div>
  );
}
