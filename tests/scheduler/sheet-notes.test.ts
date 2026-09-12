import { describe, expect, it } from "vitest";

import {
  noteLines,
  normalizeSheetNotes,
  parseSheetNotes,
  SMVA_SHEET_NOTES,
} from "@/lib/competition/sheet-notes";
import { resolvePlaceholders, type SheetTeam } from "@/lib/scheduler/gym-sheet";

describe("parseSheetNotes", () => {
  it("reads well-formed sections", () => {
    expect(parseSheetNotes([{ title: "Rules", body: "One\nTwo" }])).toEqual([
      { title: "Rules", body: "One\nTwo" },
    ]);
  });

  it("is empty for anything that isn't an array", () => {
    for (const raw of [null, undefined, {}, "text", 7]) {
      expect(parseSheetNotes(raw)).toEqual([]);
    }
  });

  // Organizer JSON reaches a PRINT layout — a headless block or a non-string
  // body would render a gap or throw mid-page. Drop, never repair.
  it("drops sections that could not be printed", () => {
    expect(
      parseSheetNotes([
        { title: "Good", body: "fine" },
        { title: "No body" },
        { body: "No title" },
        { title: 1, body: "wrong type" },
        { title: "   ", body: "   " },
        null,
        "nope",
      ]),
    ).toEqual([{ title: "Good", body: "fine" }]);
  });

  // A heading with nothing under it yet is an organizer mid-edit, not a
  // broken section — only one with NEITHER is unusable.
  it("keeps a section that has a heading but no body yet", () => {
    expect(parseSheetNotes([{ title: "Later", body: "" }])).toEqual([
      { title: "Later", body: "" },
    ]);
  });

  it("trims but preserves internal line breaks", () => {
    expect(parseSheetNotes([{ title: "  T  ", body: "  a\nb  " }])).toEqual([
      { title: "T", body: "a\nb" },
    ]);
  });

  it("caps how many sections a sheet can carry", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      title: `S${i}`,
      body: "x",
    }));
    expect(parseSheetNotes(many)).toHaveLength(12);
  });

  it("truncates rather than letting one section run off the page", () => {
    const [note] = parseSheetNotes([
      { title: "x".repeat(200), body: "y".repeat(5000) },
    ]);
    expect(note.title).toHaveLength(80);
    expect(note.body).toHaveLength(2000);
  });

  it("normalize is the same rules, applied on the way in", () => {
    expect(
      normalizeSheetNotes([
        { title: "A", body: "keep" },
        { title: "", body: "" },
      ]),
    ).toEqual([{ title: "A", body: "keep" }]);
  });
});

describe("noteLines", () => {
  it("splits a body into the lines a sheet prints", () => {
    expect(noteLines({ title: "T", body: "one\ntwo\n\nthree" })).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("is empty for an empty body", () => {
    expect(noteLines({ title: "T", body: "" })).toEqual([]);
  });
});

describe("Scarborough's own sections", () => {
  it("survive a round trip unchanged", () => {
    expect(parseSheetNotes(SMVA_SHEET_NOTES)).toEqual(SMVA_SHEET_NOTES);
  });

  it("carry the four headings from their sheet", () => {
    expect(SMVA_SHEET_NOTES.map((n) => n.title)).toEqual([
      "Team Responsibilities",
      "General responsibilities",
      "Team {D} responsibilities",
      "Winning team responsibilities",
    ]);
  });

  // "{D}" is a placeholder, not a bare letter: the renderer turns it into the
  // fourth seed's name, which is who actually locks up.
  it("resolve their placeholder headings to real teams", () => {
    const teams: SheetTeam[] = ["VOID", "ONE PUNCH", "EMPIRE", "MESLA"].map(
      (name) => ({ id: name, name }),
    );
    const heading = SMVA_SHEET_NOTES[2].title;
    expect(resolvePlaceholders(heading, teams)).toBe(
      "Team MESLA responsibilities",
    );
  });

  // The bug the first sample sheet printed: an organizer's article became a
  // team name. Prose must survive untouched.
  it("leave ordinary prose completely alone", () => {
    const teams: SheetTeam[] = ["VOID", "ONE PUNCH", "EMPIRE", "MESLA"].map(
      (name) => ({ id: name, name }),
    );
    const line = "A 4-minute warning will be given: an unfinished first game";
    expect(resolvePlaceholders(line, teams)).toBe(line);
  });

  it("print as bullets, not one paragraph", () => {
    expect(noteLines(SMVA_SHEET_NOTES[1])).toHaveLength(4);
    expect(noteLines(SMVA_SHEET_NOTES[3])).toHaveLength(1);
  });
});
