import { describe, expect, it } from "vitest";

import { missingRequired } from "@/lib/registration/required-answers";
import type { RegistrationQuestion } from "@/lib/queries/registration-questions";

const q = (
  id: string,
  label: string,
  required: boolean,
  extra: Partial<RegistrationQuestion> = {},
): RegistrationQuestion => ({
  id,
  scope: "player",
  kind: "short_text",
  label,
  helpText: null,
  options: [],
  required,
  position: 0,
  parentQuestionId: null,
  showWhen: null,
  ...extra,
});

describe("missingRequired", () => {
  it("returns nothing when there are no questions", () => {
    expect(missingRequired([], {})).toEqual([]);
  });

  it("ignores an optional question left blank", () => {
    expect(missingRequired([q("a", "Nickname", false)], {})).toEqual([]);
  });

  it("flags a required question with no answer", () => {
    const missing = missingRequired([q("a", "Gender", true)], {});
    expect(missing.map((m) => m.label)).toEqual(["Gender"]);
  });

  it("treats whitespace as no answer, the same as the database's btrim", () => {
    expect(
      missingRequired([q("a", "Gender", true)], { a: "   " }),
    ).toHaveLength(1);
  });

  it("passes once a required question is answered", () => {
    expect(missingRequired([q("a", "Gender", true)], { a: "Female" })).toEqual(
      [],
    );
  });

  it("does not ask for a follow-up whose parent says otherwise", () => {
    // "If yes, at what level?" is not owed by somebody who answered No.
    const questions = [
      q("p", "Have you played in this league before?", true, {
        kind: "yes_no",
      }),
      q("c", "At what level?", true, {
        parentQuestionId: "p",
        showWhen: "Yes",
      }),
    ];
    expect(missingRequired(questions, { p: "No" })).toEqual([]);
  });

  it("asks for a follow-up once its parent reveals it", () => {
    const questions = [
      q("p", "Have you played in this league before?", true, {
        kind: "yes_no",
      }),
      q("c", "At what level?", true, {
        parentQuestionId: "p",
        showWhen: "Yes",
      }),
    ];
    const missing = missingRequired(questions, { p: "Yes" });
    expect(missing.map((m) => m.label)).toEqual(["At what level?"]);
  });

  it("is satisfied by a revealed follow-up that has been answered", () => {
    const questions = [
      q("p", "Played before?", true, { kind: "yes_no" }),
      q("c", "At what level?", true, {
        parentQuestionId: "p",
        showWhen: "Yes",
      }),
    ];
    expect(missingRequired(questions, { p: "Yes", c: "Competitive" })).toEqual(
      [],
    );
  });

  it("an unanswered parent does not drag its follow-up in with it", () => {
    // The follow-up isn't on screen yet, so asking for it would name a field
    // the player cannot see.
    const questions = [
      q("p", "Played before?", true, { kind: "yes_no" }),
      q("c", "At what level?", true, {
        parentQuestionId: "p",
        showWhen: "Yes",
      }),
    ];
    const missing = missingRequired(questions, {});
    expect(missing.map((m) => m.label)).toEqual(["Played before?"]);
  });

  it("names every outstanding question, in the order asked", () => {
    // BVL's real shape: eight player questions, one of them left blank.
    const questions = [
      q("f", "First name", true),
      q("l", "Last name", true),
      q("g", "Gender", true, { kind: "select", options: ["Male", "Female"] }),
      q("s", "Skill level", true, { kind: "select", options: ["Rec"] }),
      q("p", "Phone number", true, { kind: "phone" }),
      q("a", "Full address", true, { kind: "address" }),
    ];
    const answered = {
      f: "Akshat",
      l: "Shah",
      s: "Rec",
      p: "416 555 0134",
      a: "1 Main St",
    };
    expect(missingRequired(questions, answered).map((m) => m.label)).toEqual([
      "Gender",
    ]);
  });
});
