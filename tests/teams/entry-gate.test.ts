import { describe, expect, it } from "vitest";

import { teamEntryGate, type TeamEntryFacts } from "@/lib/teams/entry-gate";

const player = (name: string, signed = true) => ({
  userId: name.toLowerCase(),
  name,
  signed,
});

const facts = (over: Partial<TeamEntryFacts> = {}): TeamEntryFacts => ({
  status: "pending_waiver",
  minRoster: 6,
  waiverRequired: true,
  roster: [],
  ...over,
});

describe("teamEntryGate", () => {
  it("is null for a team nothing is holding", () => {
    expect(teamEntryGate(facts({ status: "active" }))).toBeNull();
  });

  // Money has its own card. A team held for payment told it is waiting on
  // signatures sends its captain to chase people who have already signed.
  it("stays out of the way of the payment gate", () => {
    expect(teamEntryGate(facts({ status: "pending_payment" }))).toBeNull();
    expect(teamEntryGate(facts({ status: "withdrawn" }))).toBeNull();
  });

  it("reports a short roster, with how short", () => {
    const gate = teamEntryGate(
      facts({ roster: [player("A"), player("B"), player("C")] }),
    );
    expect(gate).toEqual({
      reason: "roster",
      rosterSize: 3,
      minRoster: 6,
      shortBy: 3,
    });
  });

  // Rough Sets, 2026-09-14: five signatures, all counted, still held. The page
  // used to fall through to "No matches yet" here, which is the exact lie the
  // gate exists to prevent.
  it("reports the roster even when every player HAS signed", () => {
    const gate = teamEntryGate(
      facts({
        roster: [
          player("Donna Anderson"),
          player("Sascha Thomasen"),
          player("Rob"),
          player("Jennifer Pike"),
          player("Marco Zanette"),
        ],
      }),
    );
    expect(gate).toEqual({
      reason: "roster",
      rosterSize: 5,
      minRoster: 6,
      shortBy: 1,
    });
  });

  it("names who hasn't signed once the roster is full", () => {
    const gate = teamEntryGate(
      facts({
        minRoster: 2,
        roster: [player("Signed"), player("Missing", false)],
      }),
    );
    expect(gate).toEqual({
      reason: "waiver",
      outstanding: [{ userId: "missing", name: "Missing" }],
    });
  });

  // The order matters and mirrors `team_entry_blocked`: there is no point
  // chasing a signature from a team that cannot enter anyway.
  it("prefers the roster reason when a team is both short and unsigned", () => {
    const gate = teamEntryGate(
      facts({ minRoster: 4, roster: [player("A"), player("B", false)] }),
    );
    expect(gate?.reason).toBe("roster");
  });

  it("is null when the roster is full and everyone has signed", () => {
    expect(
      teamEntryGate(
        facts({ minRoster: 2, roster: [player("A"), player("B")] }),
      ),
    ).toBeNull();
  });

  it("ignores signatures where the competition asks for no waiver", () => {
    expect(
      teamEntryGate(
        facts({
          minRoster: 1,
          waiverRequired: false,
          roster: [player("A", false)],
        }),
      ),
    ).toBeNull();
  });

  it("has nothing to report with no minimum and an empty roster", () => {
    expect(teamEntryGate(facts({ minRoster: null }))).toBeNull();
  });

  // A minimum with nobody on the roster is still a short roster — the captain
  // registered and never added anyone, which is most of BVL right now.
  it("reports an empty roster against a minimum", () => {
    expect(teamEntryGate(facts({ minRoster: 6 }))).toMatchObject({
      reason: "roster",
      rosterSize: 0,
      shortBy: 6,
    });
  });
});
