import { describe, expect, it } from "vitest";

import {
  initialsFrom,
  isSignatureStyle,
  missingInitials,
  splitWaiverClauses,
} from "@/lib/waivers/clauses";

/** The real shape of Brampton Volleyball League's waiver, abridged. */
const BVL = `WARNING: BY ACCEPTING THIS AGREEMENT, YOU ARE WAIVING CERTAIN LEGAL RIGHTS.

In consideration of being permitted to participate, I agree as follows:

1. ASSUMPTION OF RISK
I understand that participation involves inherent risks.
I freely accept these risks.

2. PARTICIPANT RESPONSIBILITY
I am responsible for determining whether I am able to participate safely.

3. WAIVER AND RELEASE OF LIABILITY
I waive any claims against the BVL.`;

describe("splitWaiverClauses", () => {
  it("splits a numbered agreement and keeps the preamble out of clause 1", () => {
    const { preamble, clauses } = splitWaiverClauses(BVL);

    expect(clauses).toHaveLength(3);
    expect(clauses[0].number).toBe(1);
    expect(clauses[0].heading).toBe("ASSUMPTION OF RISK");
    expect(clauses[0].body).toContain("inherent risks");
    // The warning belongs to nobody's initials — it is not a clause.
    expect(preamble).toContain("WARNING");
    expect(clauses[0].body).not.toContain("WARNING");
  });

  it("gives each clause only its own text", () => {
    const { clauses } = splitWaiverClauses(BVL);
    expect(clauses[1].body).toContain("participate safely");
    expect(clauses[1].body).not.toContain("inherent risks");
    expect(clauses[2].body).toContain("waive any claims");
  });

  it("keeps a document whole when it has no numbered structure", () => {
    const plain =
      "I agree to play at my own risk and to follow the rules of the league.";
    const { preamble, clauses } = splitWaiverClauses(plain);
    expect(clauses).toEqual([]);
    expect(preamble).toBe(plain);
  });

  it("refuses to split on a single numbered heading", () => {
    // One "1." is a list that starts at one, not a structured agreement.
    const { clauses } = splitWaiverClauses(
      "Intro text\n\n1. ONLY CLAUSE\nBody",
    );
    expect(clauses).toEqual([]);
  });

  it("refuses to split when the numbering has gaps", () => {
    // Misreading structure is worse than not splitting: initials would be
    // recorded against headings that aren't the document's own.
    const { clauses } = splitWaiverClauses(
      "1. FIRST\nbody\n\n2. SECOND\nbody\n\n7. SEVENTH\nbody",
    );
    expect(clauses).toEqual([]);
  });

  it("refuses to split when numbering doesn't start at 1", () => {
    const { clauses } = splitWaiverClauses("2. SECOND\nbody\n\n3. THIRD\nbody");
    expect(clauses).toEqual([]);
  });

  it("ignores a year or an amount inside a sentence", () => {
    const prose =
      "The league was founded in 1981. It has run every winter since.\nDues were 40. Paid termly.";
    expect(splitWaiverClauses(prose).clauses).toEqual([]);
  });

  it("survives Windows line endings, which pasted text arrives with", () => {
    const { clauses } = splitWaiverClauses(BVL.replace(/\n/g, "\r\n"));
    expect(clauses).toHaveLength(3);
    expect(clauses[0].heading).toBe("ASSUMPTION OF RISK");
  });

  it("handles a clause with an empty body without inventing one", () => {
    const { clauses } = splitWaiverClauses("1. FIRST\n\n2. SECOND\nbody");
    expect(clauses).toHaveLength(2);
    expect(clauses[0].body).toBe("");
  });
});

describe("initialsFrom", () => {
  it("takes the first letter of each name", () => {
    expect(initialsFrom("Priya Sharma")).toBe("PS");
    expect(initialsFrom("gautam raj kollabathula")).toBe("GRK");
  });

  it("treats hyphens and apostrophes as name breaks", () => {
    expect(initialsFrom("Anne-Marie O'Brien")).toBe("AMOB");
  });

  it("copes with the ways a name field actually gets filled in", () => {
    expect(initialsFrom("  Sam   Lee  ")).toBe("SL");
    expect(initialsFrom("Cher")).toBe("C");
    expect(initialsFrom("")).toBe("");
  });

  it("stops at four, so a long name doesn't overflow the box", () => {
    expect(initialsFrom("A B C D E F")).toBe("ABCD");
  });
});

describe("missingInitials", () => {
  const clauses = splitWaiverClauses(BVL).clauses;

  it("names the clauses still blank", () => {
    expect(missingInitials(clauses, { "1": "PS" })).toEqual([2, 3]);
  });

  it("counts whitespace as blank", () => {
    expect(
      missingInitials(clauses, { "1": "PS", "2": "  ", "3": "PS" }),
    ).toEqual([2]);
  });

  it("is empty once every clause is initialled", () => {
    expect(
      missingInitials(clauses, { "1": "PS", "2": "PS", "3": "PS" }),
    ).toEqual([]);
  });
});

describe("isSignatureStyle", () => {
  it("accepts the shipped styles and nothing else", () => {
    expect(isSignatureStyle("flowing")).toBe(true);
    expect(isSignatureStyle("formal")).toBe(true);
    expect(isSignatureStyle("casual")).toBe(true);
    expect(isSignatureStyle("<script>")).toBe(false);
    expect(isSignatureStyle("")).toBe(false);
  });
});
