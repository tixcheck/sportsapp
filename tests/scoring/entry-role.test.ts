import { describe, expect, it } from "vitest";

import {
  canEditFinal,
  needsConfirmation,
  scorerRole,
  showEntryForm,
} from "@/lib/scoring/entry-role";

describe("scorer roles", () => {
  it("admin outranks scorekeeper", () => {
    expect(scorerRole(true, true)).toBe("admin");
    expect(scorerRole(false, true)).toBe("scorekeeper");
    expect(scorerRole(false, false)).toBe("player");
  });

  it("a scorekeeper's score is final and they can correct it", () => {
    expect(needsConfirmation("scorekeeper", true)).toBe(false);
    expect(canEditFinal("scorekeeper")).toBe(true);
    expect(
      showEntryForm("scorekeeper", {
        canEnter: true,
        final: true,
        awaitingMyConfirmation: false,
      }),
    ).toBe(true);
  });

  it("a captain waits for confirmation and can't touch a final score", () => {
    expect(needsConfirmation("player", true)).toBe(true);
    expect(needsConfirmation("player", false)).toBe(false);
    expect(
      showEntryForm("player", {
        canEnter: true,
        final: true,
        awaitingMyConfirmation: false,
      }),
    ).toBe(false);
    expect(
      showEntryForm("player", {
        canEnter: true,
        final: false,
        awaitingMyConfirmation: true,
      }),
    ).toBe(false);
    expect(
      showEntryForm("player", {
        canEnter: true,
        final: false,
        awaitingMyConfirmation: false,
      }),
    ).toBe(true);
  });

  it("nobody gets the form without permission to score", () => {
    for (const r of ["admin", "scorekeeper", "player"] as const)
      expect(
        showEntryForm(r, {
          canEnter: false,
          final: false,
          awaitingMyConfirmation: false,
        }),
      ).toBe(false);
  });
});
