import { describe, expect, it } from "vitest";

import {
  isUpdate,
  parseRules,
  ruleLines,
  rulesAsText,
  RULE_LIMITS,
} from "@/lib/competition/rules";

const update = {
  title: "Double contact on the set",
  houseRule: false,
  note: "",
  was: "A setter touching the ball twice in one motion was a fault.",
  now: "A double touch while setting is allowed if the ball stays on your side.",
  details: [{ label: "Example", text: "Hands hit unevenly, play goes on." }],
  inShort: "A double for a set, pass or dig is LEGAL.",
};

describe("parseRules", () => {
  it("keeps a well-formed section", () => {
    expect(parseRules([update])).toEqual([update]);
  });

  it("returns nothing for a non-array", () => {
    expect(parseRules(null)).toEqual([]);
    expect(parseRules({ title: "x" })).toEqual([]);
  });

  it("fills missing parts with blanks and trims", () => {
    expect(
      parseRules([{ title: "  Serve ", now: " Step 1 foot in. " }]),
    ).toEqual([
      {
        title: "Serve",
        houseRule: false,
        note: "",
        was: "",
        now: "Step 1 foot in.",
        details: [],
        inShort: "",
      },
    ]);
  });

  it("drops a section with no title, or a title and nothing under it", () => {
    expect(
      parseRules([{ now: "orphan body" }, { title: "Empty" }, 7, "x"]),
    ).toEqual([]);
  });

  it("drops details with no text and non-string fields", () => {
    const [s] = parseRules([
      {
        title: "T",
        now: 5,
        inShort: "ok",
        houseRule: "yes",
        details: [{ label: "L" }, { label: 3, text: "kept" }, null],
      },
    ]);
    expect(s.now).toBe("");
    expect(s.houseRule).toBe(false);
    expect(s.details).toEqual([{ label: "", text: "kept" }]);
  });

  it("caps the number of sections and text length", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      title: `R${i}`,
      now: "x".repeat(5000),
    }));
    const out = parseRules(many);
    expect(out).toHaveLength(RULE_LIMITS.sections);
    expect(out[0].now).toHaveLength(RULE_LIMITS.text);
  });
});

describe("isUpdate", () => {
  it("is an update only when it says what the rule was", () => {
    const [u, r] = parseRules([update, { title: "Serve", now: "x" }]);
    expect(isUpdate(u)).toBe(true);
    expect(isUpdate(r)).toBe(false);
  });
});

describe("ruleLines", () => {
  it("reads text, bullets, sub-bullets and numbered steps", () => {
    expect(
      ruleLines(
        "Strictly enforced.\n- Quick tip: allowed\n  - Exception: block\n\n1. Hitter first\n2) Blocker second",
      ),
    ).toEqual([
      { kind: "text", text: "Strictly enforced." },
      { kind: "bullet", text: "Quick tip: allowed", depth: 0 },
      { kind: "bullet", text: "Exception: block", depth: 1 },
      { kind: "step", n: 1, text: "Hitter first" },
      { kind: "step", n: 2, text: "Blocker second" },
    ]);
  });

  it("does not treat a hyphenated word as a bullet", () => {
    expect(ruleLines("two-hand attacks")).toEqual([
      { kind: "text", text: "two-hand attacks" },
    ]);
  });
});

describe("rulesAsText", () => {
  it("labels each part the way the tab does", () => {
    const text = rulesAsText(
      "Big Shoots",
      parseRules([
        update,
        {
          title: "Ceiling",
          houseRule: true,
          now: "Plays once.",
          inShort: "One hit.",
        },
      ]),
    );
    expect(text).toContain("League: Big Shoots");
    expect(text).toContain("## Double contact on the set (rule update)");
    expect(text).toContain("What it was: A setter");
    expect(text).toContain("What it is now: A double touch");
    expect(text).toContain("Example: Hands hit unevenly");
    expect(text).toContain("## Ceiling (house rule)");
    expect(text).toContain("Rule: Plays once.");
    expect(text).toContain("In short: One hit.");
  });
});
