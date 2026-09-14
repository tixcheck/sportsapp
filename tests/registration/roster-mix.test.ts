import { describe, expect, it } from "vitest";

import {
  choiceColumns,
  countFor,
  tallyChoices,
} from "@/lib/registration/roster-mix";

/** Brampton's own question. */
const GENDER = ["Male", "Female", "Non-Binary"];

describe("tallyChoices", () => {
  it("counts a roster against the declared options", () => {
    const t = tallyChoices(
      ["Male", "Female", "Male", "Female", "Non-Binary", "Male"],
      GENDER,
    );
    expect(t.counts).toEqual([
      { label: "Male", n: 3, expected: true },
      { label: "Female", n: 2, expected: true },
      { label: "Non-Binary", n: 1, expected: true },
    ]);
    expect(t.unanswered).toBe(0);
    expect(t.total).toBe(6);
  });

  it("keeps the organizer's option order, not the order answered", () => {
    const t = tallyChoices(["Non-Binary", "Female"], GENDER);
    expect(t.counts.map((c) => c.label)).toEqual(GENDER);
  });

  // An option nobody picked is still a column — "0 Female" is the finding.
  it("reports a zero rather than omitting the option", () => {
    const t = tallyChoices(["Male", "Male", "Male", "Male"], GENDER);
    expect(countFor(t, "Female")).toBe(0);
    expect(t.counts).toHaveLength(3);
  });

  // Silence is not an answer. Folding it into a choice is what would make an
  // organizer act on a number nobody gave them.
  it("counts players who haven't answered separately", () => {
    const t = tallyChoices(["Male", null, "", undefined, "Female"], GENDER);
    expect(countFor(t, "Male")).toBe(1);
    expect(countFor(t, "Female")).toBe(1);
    expect(t.unanswered).toBe(3);
    expect(t.total).toBe(5);
  });

  it("always adds up to the roster size", () => {
    const answers = ["Male", null, "Female", "Other", "", "Non-Binary"];
    const t = tallyChoices(answers, GENDER);
    const summed = t.counts.reduce((n, c) => n + c.n, 0) + t.unanswered;
    expect(summed).toBe(t.total);
    expect(t.total).toBe(answers.length);
  });

  it("matches regardless of case or stray spaces", () => {
    const t = tallyChoices(["female", " MALE ", "Female"], GENDER);
    expect(countFor(t, "Female")).toBe(2);
    expect(countFor(t, "Male")).toBe(1);
    expect(t.counts.every((c) => c.expected)).toBe(true);
  });

  // Options are editable after people have answered. Dropping the old answers
  // would leave the columns not adding up to the roster.
  it("keeps an answer that is no longer an offered option", () => {
    const t = tallyChoices(["Male", "Prefer not to say"], GENDER);
    expect(t.counts).toContainEqual({
      label: "Prefer not to say",
      n: 1,
      expected: false,
    });
    expect(t.unanswered).toBe(0);
  });

  it("handles a question with no options at all", () => {
    const t = tallyChoices(["anything"], []);
    expect(t.counts).toEqual([{ label: "anything", n: 1, expected: false }]);
  });

  it("is empty for an empty roster", () => {
    const t = tallyChoices([], GENDER);
    expect(t.total).toBe(0);
    expect(t.unanswered).toBe(0);
    expect(t.counts.every((c) => c.n === 0)).toBe(true);
  });
});

describe("choiceColumns", () => {
  it("is the declared options when nothing unexpected was answered", () => {
    const tallies = [tallyChoices(["Male"], GENDER)];
    expect(choiceColumns(tallies, GENDER)).toEqual(GENDER);
  });

  it("adds a column for a stray somebody actually gave", () => {
    const tallies = [
      tallyChoices(["Male"], GENDER),
      tallyChoices(["Prefer not to say"], GENDER),
    ];
    expect(choiceColumns(tallies, GENDER)).toEqual([
      ...GENDER,
      "Prefer not to say",
    ]);
  });

  // Every tally carries a zero for every declared option, so without the
  // count check each team would contribute every other team's strays.
  it("does not add a column for a stray with no answers behind it", () => {
    const tallies = [tallyChoices([], GENDER)];
    expect(choiceColumns(tallies, GENDER)).toEqual(GENDER);
  });
});
