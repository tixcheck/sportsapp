"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { addKotcPairAction } from "@/server/actions/kotc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddPairForm({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");

  function add() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Enter a pair name.");
      return;
    }
    start(async () => {
      const res = await addKotcPairAction(competitionId, { name: trimmed });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setName("");
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <Input
        placeholder="Pair name (e.g. Sam & Riley)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
        className="max-w-xs"
      />
      <Button type="button" size="sm" onClick={add} disabled={pending}>
        <Plus /> Add pair
      </Button>
    </div>
  );
}
