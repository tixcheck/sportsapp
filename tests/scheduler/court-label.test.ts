import { describe, expect, it } from "vitest";

import {
  formatCourtLabel,
  normalizeCourtLabel,
  sameCourt,
} from "@/lib/scheduler/court-label";

describe("normalizeCourtLabel", () => {
  it("strips the display prefix so stored values match court_list labels", () => {
    expect(normalizeCourtLabel("Court 10")).toBe("10");
    expect(normalizeCourtLabel("10")).toBe("10");
    expect(normalizeCourtLabel("court 10")).toBe("10");
    expect(normalizeCourtLabel("COURT 10")).toBe("10");
  });

  it("keeps non-numeric labels", () => {
    expect(normalizeCourtLabel("Court A")).toBe("A");
    expect(normalizeCourtLabel("A")).toBe("A");
  });

  it("only strips a prefix followed by whitespace", () => {
    // A court genuinely named "Courtyard" must survive intact.
    expect(normalizeCourtLabel("Courtyard")).toBe("Courtyard");
  });

  it("treats missing and blank as no court", () => {
    expect(normalizeCourtLabel(null)).toBeNull();
    expect(normalizeCourtLabel(undefined)).toBeNull();
    expect(normalizeCourtLabel("")).toBeNull();
    expect(normalizeCourtLabel("   ")).toBeNull();
    expect(normalizeCourtLabel("Court ")).toBeNull();
  });
});

describe("formatCourtLabel", () => {
  it("always reads as 'Court X' for a player", () => {
    expect(formatCourtLabel("11")).toBe("Court 11");
    expect(formatCourtLabel("Court 11")).toBe("Court 11");
  });

  it("never double-prefixes a label that already says Court", () => {
    // court_list entries are free text — "Court A" is a legitimate label.
    expect(formatCourtLabel("Court A")).toBe("Court A");
    expect(formatCourtLabel("A")).toBe("Court A");
  });

  it("passes null through so callers can render their own fallback", () => {
    expect(formatCourtLabel(null)).toBeNull();
    expect(formatCourtLabel("")).toBeNull();
  });
});

describe("the canonical-storage invariant", () => {
  // The rule every writer must hold to: what goes in matches.court is already
  // normalized. If a new writer prefixes again, this is the tripwire — a league
  // holding both forms is what broke prime-court balancing (see HANDOFF.md).
  it("normalizing is idempotent, so a stored label is a fixed point", () => {
    for (const label of ["1", "10", "A", "Court A", "Courtyard", "Court 11"]) {
      const stored = normalizeCourtLabel(label)!;
      expect(normalizeCourtLabel(stored)).toBe(stored);
    }
  });

  it("court_list labels and stored courts compare equal once normalized", () => {
    // court_list may legitimately say "Court A"; a match stores "A".
    expect(sameCourt(normalizeCourtLabel("Court A"), "A")).toBe(true);
    expect(sameCourt(normalizeCourtLabel("11"), "Court 11")).toBe(true);
  });

  it("numberedCourts output is already canonical", async () => {
    const { numberedCourts } = await import("@/lib/scheduler/court-respread");
    for (const label of numberedCourts(5)) {
      expect(normalizeCourtLabel(label)).toBe(label);
    }
  });
});

describe("sameCourt", () => {
  it("matches across the two historical storage formats", () => {
    // The bug this exists to prevent: prime-court history stored as "Court 1"
    // never matched a court_list label of "1", so balancing restarted at zero.
    expect(sameCourt("Court 1", "1")).toBe(true);
    expect(sameCourt("1", "Court 1")).toBe(true);
    expect(sameCourt("Court A", "a")).toBe(true);
  });

  it("does not match different courts", () => {
    expect(sameCourt("Court 1", "2")).toBe(false);
    expect(sameCourt("10", "1")).toBe(false);
  });

  it("is false when either side has no court", () => {
    expect(sameCourt(null, "1")).toBe(false);
    expect(sameCourt("1", null)).toBe(false);
    expect(sameCourt(null, null)).toBe(false);
  });
});
