# AI-powered spreadsheet import — "Upload my existing schedule"

> **Status: PLANNED, deferred to a later phase** (parked 2026-06-30). Approved
> design; not started. Pick up at "Phase 1" below. Scope decided with the owner:
> **leagues first, with scores.**

## Context

Today an organizer can only create a competition and then **generate** its schedule
(round-robin / pools / the smart scheduler). Two audiences need the opposite: new
organizers who already run their league in a spreadsheet, and the owner migrating
his own past events. This feature adds a second path at the schedule step —
**"Upload my existing schedule"** — that parses an arbitrary Excel/CSV sheet with
the Anthropic API (every organizer's sheet differs, so a fixed parser won't do)
into our schema: teams, matchups, times, courts, and already-played scores →
standings. The AI **will** occasionally misread a messy sheet, so a **mandatory
human review-and-correct gate** sits between parse and commit — nothing is ever
written to the DB blind.

PRD §"Excel/PDF import" already sanctions this (Phase 12+) and reserves
`ANTHROPIC_API_KEY`. CLAUDE.md requires new deps be justified (two are needed).

## Phasing (narrow first, widen later)

- **Phase 1 (this plan): Leagues, with results.** One division, a flat match list
  (round, home/away, time, court, set scores). Ships the full pipeline
  (upload → parse → review/correct → commit) end-to-end on the simplest shape —
  exactly the owner's past-league migration. Files: `.xlsx`, `.xls`, `.csv`.
- **Phase 2:** Tournaments (pools + pool matchups/scores), and persisting the raw
  upload to Supabase Storage for re-parse.
- **Phase 3:** Bracket reconstruction, multi-division, **PDF** (Anthropic
  `document`/vision block) and Google Sheets via export.

Each phase reuses the same pipeline; only the schema target and parser prompt widen.

## 1. The setup-flow fork (generate vs upload — same end state)

Creation and scheduling are already decoupled (`createLeagueAction` makes a
`draft`; `generateLeagueScheduleAction` fills matches and flips status to
`scheduled`). So the fork lives at the **schedule step on the league detail page**,
not in the creation wizard (lowest risk, mirrors the existing button).

- `app/(app)/orgs/[orgId]/leagues/[leagueId]/page.tsx` — in the Schedule card
  header, render the existing `GenerateScheduleButton` **and** a new
  `UploadScheduleButton` (a segmented "Generate / Upload" choice). Both end at the
  same place: `matches` (+`teams`) rows written, `status='scheduled'`.
- The upload button opens the import flow (a dialog/sub-view holding the review
  UI). On successful commit → `router.refresh()`, same as generate.

## 2. File handling

- **Server Action takes `FormData` with the `File`** (Next 15 supports it) — no API
  route needed, honoring CLAUDE.md's "no API routes except webhooks". Validate
  extension (`.xlsx`/`.xls`/`.csv`) and a size cap (e.g. ≤ 5 MB) before doing
  anything.
- Parse **server-side with SheetJS (`xlsx`)** into a 2-D cell grid. **Do not send
  the file to the model as vision** — spreadsheets are tabular text; a text grid is
  more accurate and far cheaper than an image. Serialize the grid to a compact
  text block **with row/column indices preserved** (so the model can refer to
  "row 4, col C") and a note of the sheet/tab names.
- Guard token size with `client.messages.countTokens(...)` before the parse call;
  if oversized, tell the user (don't silently truncate).
- Phase 1 parses in memory and **does not persist the raw file** (privacy; Storage
  re-parse is Phase 2). `ANTHROPIC_API_KEY` is read via `process.env` server-side
  with a missing-key guard (mirrors `lib/email/send.ts`).

## 3. The AI mapping (reliable structured output)

New module `lib/import/parse-schedule.ts` (the only place that calls the Anthropic
SDK). Uses **`@anthropic-ai/sdk`**, model **`claude-opus-4-8`** (`$5/$25` per MTok;
note `claude-sonnet-4-6` at `$3/$15` as a cheaper swap if volume grows), with
`thinking: {type: "adaptive"}` and **streaming** (sheets can be large).

- **Reliable structured output via `client.messages.parse()`** with
  `output_config: { format: zodOutputFormat(ImportSchema) }` — the SDK forces the
  response to validate against a Zod schema and returns `response.parsed_output`
  (no hand-parsing; the model retries on mismatch). Handle `stop_reason: "refusal"`
  and `max_tokens` before reading output.
- **`ImportSchema` (Zod) — a normalized intermediate representation (IR)**, teams
  referenced by **name** (ids resolved at commit, not by the model):
  ```ts
  {
    teams: { name: string }[],
    matches: {
      homeTeam: string, awayTeam: string,   // names, verbatim from the sheet
      round?: number, court?: string,
      scheduledAt?: string,                  // ISO if derivable, else raw text
      played: boolean,
      sets?: { home: number, away: number }[], // present iff played
    }[],
    warnings: string[],                      // every ambiguity the model couldn't resolve
  }
  ```
  (Zod-schema limits are fine here — no recursion, no numeric min/max needed.)
- **System prompt** states: the domain (a volleyball **league** — teams play
  matches; a result is a list of set scores in home/away order), the IR to fill,
  and the rules: copy team names **verbatim**, **preserve home/away orientation**,
  only set `played: true` + `sets` when a real score is present, and **put anything
  ambiguous in `warnings` rather than guessing**. The user turn carries the
  indexed cell grid.

## 4. CRITICAL — the human review-and-correct gate (mandatory)

The parse result is **returned to the client, never committed directly.** Mirror
`components/tournament/generate-pools-panel.tsx` (holds the proposed structure in
client state, renders an editable preview, validates, and only commits on confirm).

- New `components/league/import-review.tsx`: shows the parsed IR as **editable
  tables** — a teams list and a matches grid (home/away, round, time, court,
  scores) — built with react-hook-form + zod + sonner (the app's standard stack).
- **AI `warnings` are surfaced prominently** at the top and inline on the affected
  rows; ambiguous scores/dates are highlighted and **must be confirmed**.
- Live validation before the commit button enables: every match's home/away name
  resolves to a team in the teams list (new names → "will be created" badge; like
  generate-pools' `validatePoolStructure`), scores are non-negative integers,
  dates parse. Blocked state disables "Import", exactly like the pools panel.
- Only on explicit confirm does it call the commit action with the (possibly
  edited) IR.

Two server actions in `server/actions/leagues.ts` (named exports, `ActionError`
union, **`is_competition_admin` RPC guard** + RLS, like
`updateLeagueSettingsAction`):
- `parseLeagueScheduleUploadAction(competitionId, formData)` → `{ ir } | { error }`
  (validate file → SheetJS grid → `parseSchedule` → return IR; **no DB writes**).
- `commitImportedLeagueScheduleAction(competitionId, ir)` → validates server-side,
  then **delete-then-insert** like `generateLeagueScheduleAction`: upsert `teams`
  by name (name-only teams are allowed — only `competition_id`+`name` are required),
  insert `matches` (home/away/round/court/`scheduled_at`; `status='completed'` when
  played else `'scheduled'`) and, for played matches, `sets` rows
  (`set_number` 1..N, home/away scores). Sets `competitions.status='scheduled'`.
  **Standings derive automatically** from `matches`+`sets` at read time
  (`lib/standings/compute.ts`) — no cache write required; optionally warm
  `recomputeStandings` at the end.

## 5. Error / partial handling

- **Can't parse parts** → model emits `warnings` + a partial IR; the review gate
  shows the gaps; organizer fills/fixes or cancels. Never auto-commit a flagged row.
- **Team-name mismatches** → resolution is by name at the review step: unknown
  names show a "new team" badge and an inline merge/rename control; a match
  referencing a name absent from the teams list blocks commit until fixed.
- **Ambiguous scores** → land in `warnings`, highlighted on the row, must be
  confirmed/edited before "Import" enables.
- **File too big / wrong type / token-oversized** → caught before the AI call.
- **AI refusal / API error / `max_tokens`** → surfaced as an `ActionError`; the UI
  offers retry, and the existing "Generate schedule" + manual add-team paths remain
  as the fallback.

## New dependencies (justified per CLAUDE.md)

- **`@anthropic-ai/sdk`** — the AI parse is the core of the feature; PRD sanctions
  it and `ANTHROPIC_API_KEY` is reserved.
- **`xlsx` (SheetJS)** — read `.xlsx`/`.xls`/`.csv` to cells server-side; one lib
  covers all three. (Alternative `exceljs` if SheetJS's npm-distribution quirk
  bites; CSV-only could use `papaparse`, but we need Excel too.)

## Critical files

- `lib/import/parse-schedule.ts` — NEW (Anthropic SDK call, Zod `ImportSchema`,
  `messages.parse`, grid serialization)
- `lib/validations/import.ts` — NEW (the Zod IR shared by parser + review form +
  commit action)
- `server/actions/leagues.ts` — ADD `parseLeagueScheduleUploadAction`,
  `commitImportedLeagueScheduleAction`
- `components/league/upload-schedule-button.tsx`, `import-review.tsx` — NEW
- `app/(app)/orgs/[orgId]/leagues/[leagueId]/page.tsx` — add the Generate/Upload
  fork in the Schedule card
- `.env.example` / env guard — `ANTHROPIC_API_KEY` already documented; add the
  server-side read + missing-key guard
- Reuse: `lib/supabase/server.ts` (RLS client), `is_competition_admin` RPC,
  `generateLeagueScheduleAction` (delete-then-insert + status flip pattern),
  `generate-pools-panel.tsx` (editable-preview-then-commit pattern),
  `lib/standings/compute.ts` (standings derive from matches+sets — import is
  sufficient).

## Suggested build order (engine-first, with checkpoints)

1. Deps + IR schema (`lib/validations/import.ts`) + `ANTHROPIC_API_KEY` env guard.
2. Parser core (`lib/import/parse-schedule.ts`) with **mocked-Anthropic** unit
   tests (clean / messy headers / missing scores / swapped columns); show green.
3. Server actions (parse = no writes; commit = delete-then-insert, admin-checked).
4. Review-gate UI + the Generate/Upload fork on the league page.
5. Manual verify on a throwaway league (needs `ANTHROPIC_API_KEY` in `.env.local`).

## Verification (end-to-end)

1. **Unit-test the parser deterministically** with a mocked Anthropic client (no
   live API in tests); assert IR mapping + that ambiguities land in `warnings`.
2. **Manual run** (dev server, throwaway league): upload a finished season `.xlsx`,
   confirm the review grid matches, deliberately mis-label a column to confirm a
   `warning` appears and commit is blocked until corrected, then Import → verify
   `matches`/`sets` rows and that **standings render** from the imported scores.
3. `npm test`, `tsc --noEmit`, `npm run lint`, `prettier --check`.

## Risks / notes

- The score columns are the messiest parse — the review gate is the safety net.
- Don't persist the raw upload in Phase 1 (privacy); revisit with Storage in Phase 2.
- Pool standings (Phase 2) require `matches.pool_id` **and** both teams'
  `teams.pool_id` to match — not a Phase 1 concern (leagues have no pools).
- All writes go through the RLS publishable-key client + admin RPC; never the
  secret key (user-facing path).
