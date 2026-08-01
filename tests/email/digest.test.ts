import { describe, expect, it } from "vitest";

import { buildReminderItems, type DigestMatchInput } from "@/lib/email/digest";

const TO = "America/Toronto";

function m(over: Partial<DigestMatchInput> = {}): DigestMatchInput {
  return {
    competitionName: "POUNDTOWN",
    opponentName: "Sandstorm",
    // 2026-08-01 13:00Z = 9:00 AM in Toronto (EDT, UTC-4)
    scheduledAt: "2026-08-01T13:00:00.000Z",
    timezone: TO,
    court: "Court 1",
    round: 1,
    ...over,
  };
}

describe("buildReminderItems", () => {
  it("orders by day then start time", () => {
    const items = buildReminderItems([
      m({ opponentName: "C", scheduledAt: "2026-08-02T14:00:00.000Z" }),
      m({ opponentName: "A", scheduledAt: "2026-08-01T13:00:00.000Z" }),
      m({ opponentName: "B", scheduledAt: "2026-08-01T14:30:00.000Z" }),
    ]);
    expect(items.map((i) => i.summary)).toEqual(["vs A", "vs B", "vs C"]);
    expect(items.map((i) => i.when)).toEqual([
      "Sat, Aug 1 · 9:00 AM",
      "Sat, Aug 1 · 10:30 AM",
      "Sun, Aug 2 · 10:00 AM",
    ]);
  });

  it("renders the day, local time and court on each game", () => {
    const [it0] = buildReminderItems([m({ court: "Court 3", round: 2 })]);
    expect(it0.when).toBe("Sat, Aug 1 · 9:00 AM");
    expect(it0.detail).toBe("Court 3 · Round 2");
    expect(it0.summary).toBe("vs Sandstorm");
    expect(it0.competitionName).toBe("POUNDTOWN");
  });

  it("converts to the competition's timezone, not the server's", () => {
    // Same instant, two venues: 13:00Z is 9am in Toronto, 6am in Vancouver.
    const [tor] = buildReminderItems([m()]);
    const [van] = buildReminderItems([m({ timezone: "America/Vancouver" })]);
    expect(tor.when).toBe("Sat, Aug 1 · 9:00 AM");
    expect(van.when).toBe("Sat, Aug 1 · 6:00 AM");
  });

  it("interleaves competitions in true chronological order", () => {
    // A later Toronto game vs an earlier Vancouver one — ordering must follow
    // the absolute instant, not the competition or the wall-clock label.
    const items = buildReminderItems([
      m({
        competitionName: "Toronto League",
        opponentName: "Late",
        scheduledAt: "2026-08-01T23:00:00.000Z",
      }),
      m({
        competitionName: "Van Open",
        opponentName: "Early",
        timezone: "America/Vancouver",
        scheduledAt: "2026-08-01T16:00:00.000Z",
      }),
    ]);
    expect(items.map((i) => i.summary)).toEqual(["vs Early", "vs Late"]);
  });

  it("omits the round when there isn't one, keeping the court", () => {
    const [it0] = buildReminderItems([m({ round: null })]);
    expect(it0.detail).toBe("Court 1");
  });

  it("omits the court when it isn't assigned, keeping the round", () => {
    const [it0] = buildReminderItems([m({ court: null })]);
    expect(it0.detail).toBe("Round 1");
  });

  it("leaves detail undefined when there's neither court nor round", () => {
    const [it0] = buildReminderItems([m({ court: null, round: null })]);
    expect(it0.detail).toBeUndefined();
  });

  it("keeps a game with an unusable timestamp, without a time label", () => {
    const [it0] = buildReminderItems([m({ scheduledAt: "not-a-date" })]);
    expect(it0.when).toBeUndefined();
    expect(it0.summary).toBe("vs Sandstorm");
    expect(it0.detail).toBe("Court 1 · Round 1");
  });

  it("sorts unusable timestamps last so real games lead the email", () => {
    const items = buildReminderItems([
      m({ opponentName: "Broken", scheduledAt: "" }),
      m({ opponentName: "Real", scheduledAt: "2026-08-01T13:00:00.000Z" }),
    ]);
    expect(items.map((i) => i.summary)).toEqual(["vs Real", "vs Broken"]);
  });

  it("keeps input order for games at the same instant (stable between sends)", () => {
    const at = "2026-08-01T13:00:00.000Z";
    const items = buildReminderItems([
      m({ opponentName: "First", scheduledAt: at }),
      m({ opponentName: "Second", scheduledAt: at }),
    ]);
    expect(items.map((i) => i.summary)).toEqual(["vs First", "vs Second"]);
  });

  it("returns nothing for no matches", () => {
    expect(buildReminderItems([])).toEqual([]);
  });
});
