"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ScoringSettingsInput } from "@/lib/validations/scoring";

export type ScoringValue = ScoringSettingsInput;

const PRESETS: { label: string; value: ScoringValue }[] = [
  {
    label: "Captains confirm",
    value: {
      allowCaptainEntry: true,
      allowRefEntry: false,
      allowOrganizerEntry: true,
      requireConfirmation: true,
    },
  },
  {
    label: "Ref scores",
    value: {
      allowCaptainEntry: false,
      allowRefEntry: true,
      allowOrganizerEntry: true,
      requireConfirmation: false,
    },
  },
  {
    label: "Organizer only",
    value: {
      allowCaptainEntry: false,
      allowRefEntry: false,
      allowOrganizerEntry: true,
      requireConfirmation: false,
    },
  },
];

function Toggle({
  label,
  desc,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
        checked ? "border-primary bg-accent" : "border-border bg-surface",
        disabled ? "opacity-70" : "hover:bg-muted",
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

export function ScoringFields({
  value,
  onChange,
}: {
  value: ScoringValue;
  onChange: (next: ScoringValue) => void;
}) {
  const set = (patch: Partial<ScoringValue>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
          Quick pick
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.value)}
              className="border-border bg-surface hover:bg-muted rounded-md border px-3 py-1.5 text-sm"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Who can enter a score?</p>
        <Toggle
          label="Captains"
          desc="Either playing team's captain"
          checked={value.allowCaptainEntry}
          onChange={(v) => set({ allowCaptainEntry: v })}
        />
        <Toggle
          label="Reffing team"
          desc="Members of the match's assigned ref team"
          checked={value.allowRefEntry}
          onChange={(v) => set({ allowRefEntry: v })}
        />
        <Toggle
          label="Organizer / admins"
          desc="Always allowed — they own the competition"
          checked
          disabled
        />
      </div>

      <Toggle
        label="Require confirmation"
        desc="A second party must confirm a submitted score before it's final"
        checked={value.requireConfirmation}
        onChange={(v) => set({ requireConfirmation: v })}
      />
    </div>
  );
}
