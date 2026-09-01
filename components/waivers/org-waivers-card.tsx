"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Lock } from "lucide-react";
import { toast } from "sonner";

import type { Waiver } from "@/lib/queries/waivers";
import {
  approveWaiverAction,
  saveWaiverDraftAction,
} from "@/server/actions/waivers";
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
import { cn } from "@/lib/utils";

/**
 * The organization's waiver: write it, approve it, and see what came before.
 *
 * Approving is a one-way door and the card says so before the click, because
 * the value of a waiver is precisely that it cannot be edited afterwards.
 * Changing the wording later means a new version, and every signature already
 * given stays attached to the text it was given for.
 */
export function OrgWaiversCard({
  orgId,
  waivers,
}: {
  orgId: string;
  waivers: Waiver[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [writing, setWriting] = useState(waivers.length === 0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const current = waivers.find((w) => w.status === "approved") ?? null;

  function save() {
    start(async () => {
      const res = await saveWaiverDraftAction({ orgId, title, body });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setTitle("");
      setBody("");
      setWriting(false);
      toast.success(`Saved as draft (version ${res.version}).`);
      router.refresh();
    });
  }

  function approve(id: string) {
    start(async () => {
      const res = await approveWaiverAction(id);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Approved. The wording is now fixed.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" />
          Waiver
        </CardTitle>
        <CardDescription>
          {current
            ? `Version ${current.version} is in force. Competitions can require it.`
            : "Write your waiver here, approve it, then require it on any competition."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {waivers.length > 0 && (
          <ul className="divide-rule border-rule divide-y rounded-lg border">
            {waivers.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {w.title}
                    <span className="text-ink-3 ml-2 font-normal">
                      v{w.version}
                    </span>
                  </span>
                  <span className="text-ink-3 block text-xs">
                    {w.status === "approved" ? (
                      <>
                        Approved{" "}
                        {w.approvedAt
                          ? new Date(w.approvedAt).toLocaleDateString("en-CA")
                          : ""}{" "}
                        · wording locked
                      </>
                    ) : (
                      "Draft — not in force"
                    )}
                  </span>
                </span>

                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                    w.status === "approved"
                      ? "bg-pine/15 text-pine"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {w.status === "approved" ? (
                    <span className="flex items-center gap-1">
                      <Lock className="size-3" />
                      In force
                    </span>
                  ) : (
                    "Draft"
                  )}
                </span>

                {w.status === "draft" && (
                  <Button
                    size="sm"
                    onClick={() => approve(w.id)}
                    disabled={pending}
                  >
                    <CheckCircle2 className="size-4" />
                    Approve
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {writing ? (
          <div className="border-rule space-y-3 rounded-lg border p-3">
            <div className="grid gap-1.5">
              <Label htmlFor="w-title">Title</Label>
              <Input
                id="w-title"
                value={title}
                placeholder="Participant Waiver and Release of Liability"
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="w-body">Waiver text</Label>
              <textarea
                id="w-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                placeholder="Paste the wording your organization has approved…"
                className="border-input bg-surface min-h-48 rounded-md border px-3 py-2 font-mono text-xs leading-relaxed"
              />
              <p className="text-ink-3 text-xs">
                Paste it exactly as your organization approved it. Once you
                approve it here the wording is locked — changing it later
                creates a new version, and signatures already given stay
                attached to the version they were given for.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={save}
                disabled={
                  pending || title.trim().length < 2 || body.trim().length < 50
                }
              >
                {pending ? "Saving…" : "Save as draft"}
              </Button>
              {waivers.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setWriting(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setWriting(true)}>
            {waivers.length ? "Write a new version" : "Write your waiver"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
