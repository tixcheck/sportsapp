"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { updateNotificationPrefsAction } from "@/server/actions/profile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Prefs = {
  notifyResults: boolean;
  notifyScheduleChanges: boolean;
  notifyWeekly: boolean;
};

const TOGGLES: { key: keyof Prefs; label: string; desc: string }[] = [
  {
    key: "notifyResults",
    label: "Match results",
    desc: "When a score is recorded for one of your matches.",
  },
  {
    key: "notifyScheduleChanges",
    label: "Schedule changes",
    desc: "When one of your matches is moved to a new time or court.",
  },
  {
    key: "notifyWeekly",
    label: "Weekly digest",
    desc: "Sunday evening: your matches for the week.",
  },
];

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
        checked
          ? "border-primary bg-accent"
          : "border-border bg-surface hover:bg-muted",
      )}
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{desc}</span>
      </span>
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-md border",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border",
        )}
      >
        {checked && <Check className="size-3.5" />}
      </span>
    </button>
  );
}

export function NotificationPrefsForm({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [pending, start] = useTransition();
  const dirty =
    prefs.notifyResults !== initial.notifyResults ||
    prefs.notifyScheduleChanges !== initial.notifyScheduleChanges ||
    prefs.notifyWeekly !== initial.notifyWeekly;

  function save() {
    start(async () => {
      const res = await updateNotificationPrefsAction(prefs);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Notification preferences saved.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        {TOGGLES.map((t) => (
          <Toggle
            key={t.key}
            label={t.label}
            desc={t.desc}
            checked={prefs[t.key]}
            onChange={(v) => setPrefs((p) => ({ ...p, [t.key]: v }))}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Invites and score-confirmation requests are always sent — they&apos;re
        needed to use the app.
      </p>
      <Button onClick={save} disabled={pending || !dirty}>
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </div>
  );
}
