import { describe, expect, it } from "vitest";

import { currentSession, splitSessions } from "@/lib/schedule/sessions";

/** Big Shoots' first three sessions, with the Christmas gap in the middle. */
const NIGHTS = [
  "2026-09-18",
  "2026-09-25",
  "2026-10-02",
  "2026-10-09",
  "2026-10-16",
  "2026-10-23",
  "2026-12-11",
  "2026-12-18",
  "2027-01-08",
];

describe("splitSessions", () => {
  it("groups played nights into blocks", () => {
    expect(splitSessions(NIGHTS, 3)).toEqual([
      ["2026-09-18", "2026-09-25", "2026-10-02"],
      ["2026-10-09", "2026-10-16", "2026-10-23"],
      ["2026-12-11", "2026-12-18", "2027-01-08"],
    ]);
  });

  // Holidays produce no matches and so no night: the session spans the gap
  // instead of being cut short by it.
  it("spans a holiday gap rather than being shifted by it", () => {
    expect(splitSessions(NIGHTS, 3)[2]).toEqual([
      "2026-12-11",
      "2026-12-18",
      "2027-01-08",
    ]);
  });

  it("keeps a short final session", () => {
    expect(splitSessions(NIGHTS.slice(0, 4), 3)).toEqual([
      ["2026-09-18", "2026-09-25", "2026-10-02"],
      ["2026-10-09"],
    ]);
  });

  it("orders and de-duplicates the nights it is given", () => {
    const messy = ["2026-09-25", "2026-09-18", "2026-09-18"];
    expect(splitSessions(messy, 2)).toEqual([["2026-09-18", "2026-09-25"]]);
  });

  it("has no sessions for a league without them", () => {
    expect(splitSessions(NIGHTS, null)).toEqual([]);
    expect(splitSessions(NIGHTS, 1)).toEqual([]);
  });
});

describe("currentSession", () => {
  it("is the first session before the season starts", () => {
    expect(currentSession(NIGHTS, 3, "2026-09-01")).toEqual({
      number: 1,
      total: 3,
      nights: ["2026-09-18", "2026-09-25", "2026-10-02"],
    });
  });

  it("is still this session on its own game night", () => {
    expect(currentSession(NIGHTS, 3, "2026-10-02")?.number).toBe(1);
  });

  // The playoff has been played; the next people to take the court are the
  // re-drafted teams of session 2.
  it("moves on to the next session once a playoff night has passed", () => {
    expect(currentSession(NIGHTS, 3, "2026-10-03")?.number).toBe(2);
  });

  it("stays in the session across a holiday gap", () => {
    expect(currentSession(NIGHTS, 3, "2026-12-27")?.number).toBe(3);
  });

  it("is the last session once the season is over", () => {
    expect(currentSession(NIGHTS, 3, "2027-06-01")?.number).toBe(3);
  });

  it("is null without sessions or without a schedule", () => {
    expect(currentSession(NIGHTS, null, "2026-10-01")).toBeNull();
    expect(currentSession([], 3, "2026-10-01")).toBeNull();
  });
});
