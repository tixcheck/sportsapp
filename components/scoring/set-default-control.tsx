"use client";

import { Flag } from "lucide-react";

import type { DefaultedBy } from "@/lib/scoring/defaults";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * "Default" on one set (0183): pick the team that didn't play it, and the form
 * fills the set as the other team winning it to the target, 0 to them. Or
 * "Both teams" (0184): 0–0, nobody wins the set.
 */
export function SetDefaultControl({
  homeTeamName,
  awayTeamName,
  defaultedBy,
  onChange,
}: {
  homeTeamName: string;
  awayTeamName: string;
  defaultedBy: DefaultedBy | null;
  onChange: (side: DefaultedBy | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
        >
          <Flag className="size-3.5" />
          Default
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Who defaulted this set?</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onChange("home")}>
          {homeTeamName}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange("away")}>
          {awayTeamName}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange("both")}>
          Both teams
        </DropdownMenuItem>
        {defaultedBy && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(null)}>
              Not a default
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
