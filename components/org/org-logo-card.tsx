"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateOrgLogoAction } from "@/server/actions/orgs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ImageUpload } from "@/components/ui/image-upload";

/**
 * The organization's logo, shown to players on its registration pages.
 *
 * Until now `organizations.logo_url` existed in the schema and was rendered on
 * the public page, but there was nowhere to set it — so it was always null.
 */
export function OrgLogoCard({
  orgId,
  initialLogoUrl,
}: {
  orgId: string;
  initialLogoUrl: string | null;
}) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? "");
  const [pending, start] = useTransition();
  const dirty = logoUrl !== (initialLogoUrl ?? "");

  function save() {
    start(async () => {
      const res = await updateOrgLogoAction({ orgId, logoUrl });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(logoUrl ? "Logo saved." : "Logo removed.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo</CardTitle>
        <CardDescription>
          Shown to players on this organization&apos;s registration pages. A
          square or near-square image works best.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ImageUpload
          orgId={orgId}
          purpose="logo"
          value={logoUrl}
          onChange={setLogoUrl}
          disabled={pending}
          aspectHint="Square works best."
        />
        <div>
          <Button onClick={save} disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
