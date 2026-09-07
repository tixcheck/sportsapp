"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { toast } from "sonner";

import { setOrgHomeLocalityAction } from "@/server/actions/registration-questions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The town this organization runs for, set once.
 *
 * Every competition inherits it and any one of them can override — a club with
 * a town league and a regional tournament wants the distinction drawn on only
 * one of them. Setting it here rather than four times is also three fewer
 * chances to type the town differently, and "Brampton" against "brampton " is
 * two towns to a count that groups by name.
 */
export function OrgLocalityCard({
  orgId,
  initial,
}: {
  orgId: string;
  initial: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [city, setCity] = useState(initial ?? "");

  const dirty = city.trim() !== (initial ?? "");

  function save() {
    start(async () => {
      const res = await setOrgHomeLocalityAction({
        orgId,
        homeLocality: city.trim() || null,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        city.trim()
          ? `Leagues will count players from ${city.trim()}.`
          : "Turned off for every league.",
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="size-4" />
          Home town
        </CardTitle>
        <CardDescription>
          Where your organization is based. Leagues that ask players for an
          address will show how many of each team live here — useful if your
          league exists for one community. Any league can set a different town.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="org-locality">Town</Label>
            <Input
              id="org-locality"
              value={city}
              placeholder="Brampton"
              onChange={(e) => setCity(e.target.value)}
              className="max-w-56"
            />
          </div>
          <Button onClick={save} disabled={pending || !dirty} variant="outline">
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>

        <p className="text-muted-foreground text-xs">
          Leave it blank and no league draws the distinction. Counting only
          works where a league asks for an address, so this on its own changes
          nothing until it does.
        </p>
      </CardContent>
    </Card>
  );
}
