"use client";

import Link from "next/link";
import { useTransition } from "react";
import { usePathname } from "next/navigation";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";

import { setCurrentOrgAction } from "@/server/actions/orgs";
import type { UserOrg } from "@/lib/auth/user";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function OrgSwitcher({
  orgs,
  currentOrgId,
}: {
  orgs: UserOrg[];
  currentOrgId?: string;
}) {
  const [pending, startTransition] = useTransition();
  // The org whose page is open wins over the remembered one: arriving at
  // another org by a link kept the old name showing (2026-10-20, BVL's page
  // labelled "Mango Sports").
  const urlOrgId = usePathname().match(/^\/orgs\/([0-9a-f-]{36})/)?.[1];

  if (orgs.length === 0) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/orgs/new">
          <Plus />
          New organization
        </Link>
      </Button>
    );
  }

  const current =
    orgs.find((o) => o.id === urlOrgId) ??
    orgs.find((o) => o.id === currentOrgId) ??
    orgs[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          <Building2 />
          <span className="max-w-[12rem] truncate">{current.name}</span>
          <ChevronsUpDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={() => startTransition(() => setCurrentOrgAction(o.id))}
          >
            <span className="flex-1 truncate">{o.name}</span>
            {o.id === current.id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/orgs/new">
            <Plus className="size-4" />
            New organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
