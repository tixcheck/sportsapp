import { describe, expect, it } from "vitest";

import {
  playersMissingDetails,
  type DetailsRow,
} from "@/lib/registration/missing-details";
import type { RegistrationQuestion } from "@/lib/queries/registration-questions";

const q = (
  id: string,
  label: string,
  required = true,
  extra: Partial<RegistrationQuestion> = {},
): RegistrationQuestion =>
  ({
    id,
    label,
    required,
    scope: "player",
    kind: "short_text",
    parentQuestionId: null,
    showWhen: null,
    ...extra,
  }) as RegistrationQuestion;

const QUESTIONS = [
  q("g", "Gender"),
  q("p", "Phone number"),
  q("n", "Nickname", false),
];

const row = (over: Partial<DetailsRow> = {}): DetailsRow => ({
  userId: "u1",
  name: "Sam",
  email: "sam@example.com",
  hasRosterRow: false,
  freeAgentStatus: "available",
  answers: {},
  ...over,
});

describe("playersMissingDetails", () => {
  it("names the required questions a pool player hasn't answered", () => {
    expect(playersMissingDetails([row()], QUESTIONS)).toEqual([
      {
        userId: "u1",
        name: "Sam",
        email: "sam@example.com",
        missing: ["Gender", "Phone number"],
      },
    ]);
  });

  it("skips anyone who has answered every required question", () => {
    expect(
      playersMissingDetails(
        [row({ answers: { g: "F", p: "555" } })],
        QUESTIONS,
      ),
    ).toEqual([]);
  });

  it("includes rostered players; skips no-account, no-email and withdrawn", () => {
    const rows = [
      row({ userId: "a", hasRosterRow: true, freeAgentStatus: null }),
      row({ userId: null }),
      row({ userId: "b", email: null }),
      row({ userId: "c", freeAgentStatus: "withdrawn" }),
    ];
    expect(playersMissingDetails(rows, QUESTIONS).map((r) => r.userId)).toEqual(
      ["a"],
    );
  });

  it("lists a person once even if they appear twice", () => {
    expect(playersMissingDetails([row(), row()], QUESTIONS)).toHaveLength(1);
  });

  it("doesn't ask a hidden follow-up", () => {
    const qs = [
      q("played", "Played before?", true),
      q("lvl", "At what level?", true, {
        parentQuestionId: "played",
        showWhen: "yes",
      }),
    ];
    expect(
      playersMissingDetails([row({ answers: { played: "no" } })], qs),
    ).toEqual([]);
  });
});
