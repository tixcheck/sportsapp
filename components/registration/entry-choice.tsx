"use client";

import { useState } from "react";
import { ArrowLeft, User, Users } from "lucide-react";

import { cn } from "@/lib/utils";

type Choice = "team" | "individual";

/**
 * Pick a door before filling in a form.
 *
 * The two sign-up paths used to be stacked cards, one under the other, and
 * that reads as one long form with a second form appended — someone entering a
 * team scrolls past their own submit button into a set of fields asking for
 * their positions and skill level, which looks like part of what they were
 * doing. The two are alternatives, so they are presented as alternatives.
 *
 * Nothing is chosen by default. Guessing would be wrong half the time, and the
 * cost of guessing wrong is that the other path is hidden behind a control the
 * person hasn't noticed. Both are visible until one is picked.
 *
 * Rendered as children rather than props so the forms stay server-composed —
 * this component only decides which of the two is on screen.
 */
export function EntryChoice({
  teamTitle,
  teamDescription,
  individualTitle,
  individualDescription,
  teamForm,
  individualForm,
}: {
  teamTitle: string;
  teamDescription: React.ReactNode;
  individualTitle: string;
  individualDescription: React.ReactNode;
  teamForm: React.ReactNode;
  individualForm: React.ReactNode;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);

  if (choice === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Option
          icon={<Users className="size-5" />}
          title={teamTitle}
          description={teamDescription}
          cta="Register a team"
          onSelect={() => setChoice("team")}
        />
        <Option
          icon={<User className="size-5" />}
          title={individualTitle}
          description={individualDescription}
          cta="Sign up on my own"
          onSelect={() => setChoice("individual")}
        />
      </div>
    );
  }

  return (
    <div className="border-border bg-surface rounded-xl border p-5 sm:p-6">
      <button
        type="button"
        onClick={() => setChoice(null)}
        className="text-muted-foreground hover:text-foreground mb-4 -ml-1 inline-flex items-center gap-1.5 text-sm font-medium"
      >
        <ArrowLeft className="size-4" />
        {choice === "team" ? "I don't have a team" : "I have a team"}
      </button>

      <h2 className="font-display text-xl font-semibold tracking-tight">
        {choice === "team" ? teamTitle : individualTitle}
      </h2>
      <div className="text-muted-foreground mt-1 text-sm">
        {choice === "team" ? teamDescription : individualDescription}
      </div>

      <div className="mt-5">
        {choice === "team" ? teamForm : individualForm}
      </div>
    </div>
  );
}

function Option({
  icon,
  title,
  description,
  cta,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  cta: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "border-border bg-surface flex h-full flex-col rounded-xl border p-5 text-left transition-colors",
        "hover:border-primary/50 hover:bg-accent/40",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
      )}
    >
      <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-lg">
        {icon}
      </span>
      <span className="font-display mt-3 block text-lg font-semibold tracking-tight">
        {title}
      </span>
      <span className="text-muted-foreground mt-1 block flex-1 text-sm">
        {description}
      </span>
      <span className="bg-primary text-primary-foreground mt-4 block rounded-md px-4 py-2 text-center text-sm font-medium">
        {cta}
      </span>
    </button>
  );
}
