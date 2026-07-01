"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { addKotcPairAction } from "@/server/actions/kotc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Add a pair: a team name plus the two participants' first names. */
export function AddPairForm({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");

  function add() {
    const team = name.trim();
    if (team.length < 2) {
      toast.error("Enter a team name.");
      return;
    }
    const players = [p1.trim(), p2.trim()].filter(Boolean).join("/");
    start(async () => {
      const res = await addKotcPairAction(competitionId, {
        name: team,
        players,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setName("");
      setP1("");
      setP2("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Team name</span>
        <Input
          placeholder="e.g. Sand Sharks"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          className="sm:w-44"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs">Players</span>
        <div className="flex items-center gap-1.5">
          <Input
            placeholder="Sam"
            value={p1}
            onChange={(e) => setP1(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            className="w-24"
          />
          <span className="text-muted-foreground">/</span>
          <Input
            placeholder="Riley"
            value={p2}
            onChange={(e) => setP2(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
            className="w-24"
          />
        </div>
      </label>
      <Button type="button" size="sm" onClick={add} disabled={pending}>
        <Plus /> Add pair
      </Button>
    </div>
  );
}
