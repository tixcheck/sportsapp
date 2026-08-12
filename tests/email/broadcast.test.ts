import { describe, expect, it } from "vitest";

import {
  BATCH_SIZE,
  chunkRecipients,
  resolveRecipients,
  toParagraphs,
  type BroadcastMember,
} from "@/lib/email/broadcast";

const member = (over: Partial<BroadcastMember> = {}): BroadcastMember => ({
  userId: "u1",
  email: "a@x.com",
  notifyOrgMessages: true,
  unsubscribeToken: "tok1",
  role: "player",
  ...over,
});

describe("resolveRecipients", () => {
  it("includes an opted-in player with an email and a token", () => {
    expect(resolveRecipients([member()], "players")).toEqual([
      { userId: "u1", email: "a@x.com", unsubscribeToken: "tok1" },
    ]);
  });

  it("drops anyone who opted out", () => {
    expect(
      resolveRecipients([member({ notifyOrgMessages: false })], "players"),
    ).toEqual([]);
  });

  it("drops anyone with no email", () => {
    expect(resolveRecipients([member({ email: null })], "players")).toEqual([]);
    expect(resolveRecipients([member({ email: "   " })], "players")).toEqual(
      [],
    );
  });

  it("drops anyone with no unsubscribe token — never send without an opt-out", () => {
    expect(
      resolveRecipients([member({ unsubscribeToken: null })], "players"),
    ).toEqual([]);
  });

  it("dedupes a person who captains two teams", () => {
    const rows = [
      member({ userId: "u1", role: "captain" }),
      member({ userId: "u1", role: "captain" }),
      member({ userId: "u2", email: "b@x.com", unsubscribeToken: "tok2" }),
    ];
    expect(resolveRecipients(rows, "players").map((r) => r.userId)).toEqual([
      "u1",
      "u2",
    ]);
  });

  it("captains-only excludes players", () => {
    const rows = [
      member({ userId: "cap", role: "captain" }),
      member({
        userId: "ply",
        role: "player",
        email: "b@x.com",
        unsubscribeToken: "t2",
      }),
    ];
    expect(resolveRecipients(rows, "captains").map((r) => r.userId)).toEqual([
      "cap",
    ]);
    expect(resolveRecipients(rows, "players")).toHaveLength(2);
  });

  it("still honours the opt-out for captains", () => {
    expect(
      resolveRecipients(
        [member({ role: "captain", notifyOrgMessages: false })],
        "captains",
      ),
    ).toEqual([]);
  });

  it("trims the address it sends to", () => {
    expect(
      resolveRecipients([member({ email: "  a@x.com " })], "players")[0].email,
    ).toBe("a@x.com");
  });
});

describe("chunkRecipients", () => {
  it("splits into Resend-sized batches", () => {
    const rows = Array.from({ length: 250 }, (_, i) => i);
    const chunks = chunkRecipients(rows);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(BATCH_SIZE);
    expect(chunks[2]).toHaveLength(50);
    expect(chunks.flat()).toEqual(rows);
  });

  it("returns nothing for an empty list", () => {
    expect(chunkRecipients([])).toEqual([]);
  });

  it("keeps a short list in a single batch", () => {
    expect(chunkRecipients([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it("rejects a nonsense batch size", () => {
    expect(() => chunkRecipients([1], 0)).toThrow();
  });
});

describe("toParagraphs", () => {
  it("splits on blank lines", () => {
    expect(toParagraphs("First para.\n\nSecond para.")).toEqual([
      "First para.",
      "Second para.",
    ]);
  });

  it("keeps single newlines inside a paragraph", () => {
    expect(toParagraphs("line one\nline two")).toEqual(["line one\nline two"]);
  });

  it("handles Windows line endings", () => {
    expect(toParagraphs("a\r\n\r\nb")).toEqual(["a", "b"]);
  });

  it("drops empty and whitespace-only paragraphs", () => {
    expect(toParagraphs("a\n\n   \n\nb")).toEqual(["a", "b"]);
    expect(toParagraphs("   ")).toEqual([]);
  });
});
