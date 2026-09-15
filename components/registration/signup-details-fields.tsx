"use client";

import type { Sport } from "@/lib/formats";
import { SKILL_LEVELS, sportConfig } from "@/lib/sports";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** An individual sign-up's own details, as the edit form holds them. */
export type SignupDetails = {
  name: string;
  email: string;
  phone: string;
  positions: string[];
  skillLevel: string;
  notes: string;
};

/** Seed the form from whatever shape the caller has; blanks for nulls. */
export function toSignupDetails(src: {
  name: string;
  email: string | null;
  phone: string | null;
  positions: string[];
  skillLevel: string | null;
  notes: string | null;
}): SignupDetails {
  return {
    name: src.name,
    email: src.email ?? "",
    phone: src.phone ?? "",
    positions: src.positions,
    skillLevel: src.skillLevel ?? "",
    notes: src.notes ?? "",
  };
}

const selectClass =
  "border-border bg-surface h-9 w-full rounded-md border px-2 text-sm";

/**
 * The fields an individual filled in at sign-up, editable by the organizer.
 *
 * The same choices the sign-up form offers — this sport's positions, the four
 * skill levels — so an edit can never introduce a value the draft board or
 * the pool's columns don't recognise. Controlled by the caller, because the
 * Players tab saves these together with the league's questions.
 */
export function SignupDetailsFields({
  sport,
  value,
  onChange,
  disabled = false,
}: {
  sport: Sport;
  value: SignupDetails;
  onChange: (next: SignupDetails) => void;
  disabled?: boolean;
}) {
  const positions = sportConfig(sport).positions;
  const set = (patch: Partial<SignupDetails>) =>
    onChange({ ...value, ...patch });

  function togglePosition(position: string) {
    set({
      positions: value.positions.includes(position)
        ? value.positions.filter((p) => p !== position)
        : [...value.positions, position],
    });
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="signup-name">Name</Label>
        <Input
          id="signup-name"
          value={value.name}
          disabled={disabled}
          onChange={(e) => set({ name: e.target.value })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
            type="email"
            value={value.email}
            disabled={disabled}
            onChange={(e) => set({ email: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="signup-phone">Phone</Label>
          <Input
            id="signup-phone"
            type="tel"
            value={value.phone}
            disabled={disabled}
            onChange={(e) => set({ phone: e.target.value })}
          />
        </div>
      </div>

      {positions.length > 0 && (
        <div className="grid gap-1.5">
          <Label>Positions</Label>
          <div className="flex flex-wrap gap-1.5">
            {positions.map((position) => {
              const on = value.positions.includes(position);
              return (
                <button
                  key={position}
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => togglePosition(position)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-sm transition-colors",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface",
                  )}
                >
                  {position}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="signup-level">Skill level</Label>
        <select
          id="signup-level"
          className={selectClass}
          value={value.skillLevel}
          disabled={disabled}
          onChange={(e) => set({ skillLevel: e.target.value })}
        >
          <option value="" disabled>
            Pick a level
          </option>
          {SKILL_LEVELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="signup-notes">Notes</Label>
        <Input
          id="signup-notes"
          value={value.notes}
          disabled={disabled}
          placeholder="Anything worth knowing when placing them"
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}
