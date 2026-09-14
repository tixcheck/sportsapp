import { describe, expect, it } from "vitest";

import {
  isFirstNameLabel,
  isLastNameLabel,
  looksComplete,
  nameCameFromAnswers,
  resolvePlayerName,
  signatureWorthShowing,
} from "@/lib/registration/player-name";

describe("label matching", () => {
  it("matches the starter preset's own wording", () => {
    expect(isFirstNameLabel("First name")).toBe(true);
    expect(isLastNameLabel("Last name")).toBe(true);
  });

  it("is case- and space-insensitive, and tolerates a trailing marker", () => {
    for (const l of [
      "FIRST NAME",
      " first  name ",
      "First Name:",
      "first name*",
    ]) {
      expect(isFirstNameLabel(l)).toBe(true);
    }
    expect(isLastNameLabel("SURNAME")).toBe(true);
  });

  it("accepts the common synonyms", () => {
    expect(isFirstNameLabel("Given name")).toBe(true);
    expect(isFirstNameLabel("Forename")).toBe(true);
    expect(isLastNameLabel("Family name")).toBe(true);
  });

  // The match is exact after normalising, so a question that merely CONTAINS
  // the words is not mistaken for the player's own name.
  it("does not match a question that only contains the words", () => {
    expect(isLastNameLabel("Last name of emergency contact")).toBe(false);
    expect(isFirstNameLabel("First name of your doctor")).toBe(false);
    expect(isFirstNameLabel("What is your first name?")).toBe(false);
  });

  it("does not match unrelated questions", () => {
    for (const l of ["Team name", "Nickname", "Gender", "Phone number", ""]) {
      expect(isFirstNameLabel(l)).toBe(false);
      expect(isLastNameLabel(l)).toBe(false);
    }
  });
});

describe("resolvePlayerName", () => {
  // The four real BVL rows that started this: an account name shorter than
  // what the player actually gave the league.
  it("prefers the answers over a thinner account name", () => {
    expect(
      resolvePlayerName({
        first: "Sharon",
        last: "VanEerden",
        displayName: "Sharon V.",
      }),
    ).toBe("Sharon VanEerden");
    expect(
      resolvePlayerName({ first: "Rob", last: "Sleigh", displayName: "Rob" }),
    ).toBe("Rob Sleigh");
  });

  // A first name from the form is no better than the one already on the
  // account, and the account name may carry more (a middle name).
  it("keeps the account name when no surname was given", () => {
    expect(
      resolvePlayerName({
        first: "Bobbi",
        last: "",
        displayName: "Bobbi Lynn Brake",
      }),
    ).toBe("Bobbi Lynn Brake");
  });

  // Every one of these came out WORSE when the answers won unconditionally:
  // shouted back in caps, or with a middle name dropped. The answers are free
  // text, so they fill a gap and never restyle a name that is already whole.
  it("leaves an account name that is already complete", () => {
    expect(
      resolvePlayerName({
        first: "RACHEL",
        last: "DA CUNHA",
        displayName: "Rachel da Cunha",
      }),
    ).toBe("Rachel da Cunha");
    expect(
      resolvePlayerName({
        first: "Kelly",
        last: "Walker",
        displayName: "Kelly A Walker",
      }),
    ).toBe("Kelly A Walker");
    expect(
      resolvePlayerName({
        first: "Bobbi",
        last: "Brake",
        displayName: "Bobbi Lynn Brake",
      }),
    ).toBe("Bobbi Lynn Brake");
  });

  it("falls back to the account name when nothing was answered", () => {
    expect(resolvePlayerName({ displayName: "Katrina Alves" })).toBe(
      "Katrina Alves",
    );
  });

  it("uses a surname even with no first name", () => {
    expect(resolvePlayerName({ last: "Sleigh", displayName: "Rob" })).toBe(
      "Sleigh",
    );
  });

  it("uses the answers when there is no account name at all", () => {
    expect(resolvePlayerName({ first: "Marco", last: "Zanette" })).toBe(
      "Marco Zanette",
    );
  });

  it("uses a lone first name only when there is no account name", () => {
    expect(resolvePlayerName({ first: "Rob", displayName: "" })).toBe("Rob");
  });

  it("falls back to the email before giving up", () => {
    expect(resolvePlayerName({ email: "rob@example.com" })).toBe(
      "rob@example.com",
    );
  });

  // A blank cell in a list of people reads as a rendering fault.
  it("never returns an empty string", () => {
    expect(resolvePlayerName({})).toBe("—");
    expect(
      resolvePlayerName({ first: "  ", last: "  ", displayName: "  " }),
    ).toBe("—");
  });

  it("trims what it is given", () => {
    expect(resolvePlayerName({ first: "  Marco ", last: " Zanette  " })).toBe(
      "Marco Zanette",
    );
  });
});

describe("looksComplete", () => {
  it("wants two words with a real surname", () => {
    expect(looksComplete("Rachel da Cunha")).toBe(true);
    expect(looksComplete("Kelly A Walker")).toBe(true);
    expect(looksComplete("Katrina Alves")).toBe(true);
  });

  // The two shapes the organizer complained about.
  it("is false for one word, or for a trailing initial", () => {
    expect(looksComplete("Rob")).toBe(false);
    expect(looksComplete("Sharon V.")).toBe(false);
    expect(looksComplete("Cecile A")).toBe(false);
    expect(looksComplete("")).toBe(false);
    expect(looksComplete("   ")).toBe(false);
  });
});

describe("nameCameFromAnswers", () => {
  it("is true exactly when the answers drove the result", () => {
    expect(
      nameCameFromAnswers({
        first: "Rob",
        last: "Sleigh",
        displayName: "Rob",
      }),
    ).toBe(true);
    expect(
      nameCameFromAnswers({
        first: "Rachel",
        last: "da Cunha",
        displayName: "Rachel da Cunha",
      }),
    ).toBe(false);
    expect(nameCameFromAnswers({ displayName: "Katrina Alves" })).toBe(false);
  });
});

describe("signatureWorthShowing", () => {
  // The row an organizer actually needs to look at: signed short of the name
  // the league holds.
  it("is true when the signature differs from the name on file", () => {
    expect(signatureWorthShowing("John Lewis", "J. Lewis")).toBe(true);
    expect(signatureWorthShowing("Alexandra Pucci", "Alex Pucci")).toBe(true);
  });

  // Printing the same name twice on ninety rows would bury the one above.
  it("is false when they are the same name", () => {
    expect(signatureWorthShowing("Rob Sleigh", "Rob Sleigh")).toBe(false);
    expect(signatureWorthShowing("Sharon VanEerden", "Sharon VanEerden")).toBe(
      false,
    );
  });

  it("ignores case and spacing — that is the same person, not a discrepancy", () => {
    expect(signatureWorthShowing("Sarah Logozzo", "Sarah logozzo")).toBe(false);
    expect(signatureWorthShowing("Marco Zanette", "  marco   zanette ")).toBe(
      false,
    );
  });

  it("is false when nothing has been signed", () => {
    expect(signatureWorthShowing("Rob Sleigh", null)).toBe(false);
    expect(signatureWorthShowing("Rob Sleigh", "   ")).toBe(false);
  });
});
