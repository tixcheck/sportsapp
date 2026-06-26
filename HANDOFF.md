# HANDOFF — volleyball-platform

> Cross-machine continuity note. Claude Code chat history lives **locally per
> machine** and does NOT travel with the repo, so this file is the bridge.
> **To resume on a new machine:** start Claude Code in the project root and say
> _"read HANDOFF.md, CLAUDE.md, and PRD.md to catch up."_

---

## Current state (last session)

- **Branch:** `main`. **Latest commit:** `853d2d3` — pushed (Vercel auto-deploys).
- **GitHub:** `https://github.com/tixcheck/sportsapp.git`
- **Vercel project:** `my-sports-app/sportsapp` (auto-deploys on push to `main`; the GitHub commit status is the deploy signal).
- **Supabase project:** `evngfeuqyllfwkdvsrsb`. **Migrations applied through `0035`** (0034/0035 were applied by hand in the SQL editor, so Drizzle's tracking doesn't know about them — see Known quirks).
- **Tests:** `npm test` → 220 passing. tsc + eslint + prettier clean.

## ⚠️ Critical for the live tournament

- **DO NOT regenerate pools on the live tournament.** It discards the pool
  schedule (times/courts and any scores) **and moves the announced game-1
  times**. Safe alternatives: edit a single match's time/court (reschedule
  dialog), or **"Rebalance refs"** (changes referees only — never pairings,
  times, courts, or scores).
- **Pool game reorder for even wait times** was investigated and **NOT built**.
  Finding: 4-team pools are already mathematically optimal (one team always gets
  a back-to-back + a long wait — unavoidable); 5/6-team pools could benefit from
  a non-destructive reorder. Pending tomorrow's event feedback before building.

## What shipped recently (newest first)

- `853d2d3` — **League playoffs**: seed a single-elim (or Championship +
  Consolation) bracket from final league standings, reusing the tournament
  bracket engine. New `LeaguePlayoffPanel`, public **Playoffs** tab.
  `generateBracketAction` now anchors off the last regular-season match
  (`bracket_position is null`) so it works for leagues (no pools).
- `83f2f3f` — **Games-per-team target** (tournaments): organizer sets a target;
  pools are sized to deliver it (`poolSizesForGames` / `gamesPerTeamRange`,
  migration `0035` adds `tournament_settings.target_games_per_team`).
- `dc69f51` / `de8de1b` — **Edit settings after creation** (edit-until-scores)
  for leagues and tournaments.
- `36647ad` — **Daily event window**: `start_time`/`end_time` on competitions
  (migration `0034`); start seeds the default first-match time.
- `3b2b4d7` — **Slot length derived from match format** (`estimateMatchMinutes`).
- `4d0445f` — stopped sending score emails (result + confirm-request).
- `c4dc706` — **My-team page and `/my-matches` now share one `MatchSections`
  component** (can't drift). Sections: Up Next / Round Robin / Schedule (leagues)
  / Playoff bracket / Reffing.
- `40da17a` — **"Rebalance refs"** button (non-destructive, refs-only) +
  `assignPoolRefs` pure fn.
- `2e3f27a` — playoff projection shows a **rough first-game time estimate**
  (only when pool games have times; clearly a ballpark).
- `fb9f534` — **bracket shows each team's pool record + point ratio** (justifies
  seeds).
- `c0c5afc` — My-matches **Reffing** section; projection card uses **top/bottom
  bracket** language and hides the opponent until the draw.
- `6bbdb8e` — **ref-game count per team** on the Teams card.
- `b0109fe` — **balanced pool ref load** (counts differ by ≤1; reffing-crossover
  kept as the tiebreaker). _Existing tournaments only get the even spread on pool
  regeneration OR via "Rebalance refs"._
- `f315776` / `15bd232` / `362487f` — three-section My-matches + the shared
  **live bracket-preview engine** (`bracketSeedTracks` / `projectBracket` /
  `getBracketPreview`) with a divergence-lock test.
- `3d00592` — invite email **"You're registered for …"** copy with venue/dates;
  removed temporary diagnostics.
- `457f6c8` — **email send fix**: render the React template to HTML in-app
  (resend treats `@react-email/render` as an optional peer and couldn't resolve
  it at runtime — that's why invites silently failed with nothing in Resend's
  logs). Env (`RESEND_API_KEY`, `EMAIL_FROM`) confirmed in Vercel; domain
  `mysportsapp.ca` must stay verified in Resend.
- `c0f2fe9` / `4dd486d` — bracket **courts + estimated times** auto-assigned at
  generation; bracket matches scoreable + editable.
- `0dd5a6d` (migration 0033) — nulled out old auto-applied short-pool ref/format
  overrides.
- `502d6dd` (migration 0032) — fixed the `competitions` SELECT RLS policy
  (self-lookup broke `INSERT … RETURNING`, which is why tournament creation
  failed with "new row violates row-level security policy").
- `16dca6e` — standings **Ratio column shows point ratio (PF/PA)**, not set
  ratio (kills the spurious ∞).

## Open threads / candidate next work

- **Pool game reorder for even waits** (5/6-team pools) — pending event feedback.
- **Tournament-page projected-bracket panel** — would reuse `getBracketPreview`;
  optional, not built.
- **Organizer (non-member) read-only team view** still uses the flat
  `ScheduleView` (intentional). Could unify with `MatchSections` if wanted.
- Optional **"your schedule is ready" email** when pools are drawn (so captains
  get first-game court/time, which the invite can't include).

## Pending manual cleanup (Supabase SQL editor)

```sql
-- diagnostic helpers from the RLS investigation
drop function if exists public.whoami();
drop function if exists public.debug_is_org_admin(uuid);
drop function if exists public.debug_create_comp(uuid);
-- throwaway rows created during debugging
delete from public.competitions where name = 'DEBUG';
```

Also safe to delete the untracked throwaway scripts: `lib/db/_inspectorg.ts`,
`lib/db/_inspectpol.ts`.

## Environment (`.env.local` — gitignored; bring it on the USB stick)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # sb_publishable_...
SUPABASE_SECRET_KEY=                    # sb_secret_...  (server-only)
DATABASE_URL=                           # Supabase transaction pooler
RESEND_API_KEY=                         # re_...
EMAIL_FROM=MySportsApp <noreply@mysportsapp.ca>
```

- The **running app does not use `DATABASE_URL`** (it goes through the Supabase
  client) — only Drizzle migrations / `db:studio` do. The pooler password was
  rotated mid-session; if a Drizzle/db command fails with an auth error, refresh
  `DATABASE_URL` from Supabase → Project Settings → Database.
- For just making + pushing a code fix you don't even need `.env.local` (Vercel
  builds with its own env); you only need it to run `npm run dev` locally.

## Known quirks

- `next build` can **OOM** on low-RAM machines during static generation. The
  reliable gates are `tsc --noEmit`, `npm run lint`, and `npm test` — the
  pre-commit hook runs `prettier --check` + eslint + vitest, so run
  `npm run format` before committing.
- Vercel deploy = push to `main`; watch the commit status for success.
- **Git ref corruption after an abrupt restart** (this repo lives in a OneDrive
  folder): a hard restart can leave `.git/refs/heads/main` (and/or
  `.git/refs/remotes/origin/main`) filled with null bytes — git then reports
  _"branch appears to be broken / No commits yet."_ The objects are fine; only
  the tiny ref file is bad. Fix: find the real tip (`.git/packed-refs`,
  `.git/ORIG_HEAD`, `git fsck`, or `git log origin/main`), then
  `rm .git/refs/heads/main && git update-ref refs/heads/main <sha>`. Verify the
  tip is the true one (origin's loose ref under `.git/refs/remotes/origin/` may
  be newer than `packed-refs`) before trusting it.
