-- Reverse Pairs: a pair signs up together, three pairs make a team of six.
--
-- This does not fit `matches`. A match has one home team and one away team; a
-- Reverse Pairs game has THREE pairs a side, and the pairs on a side change
-- every game. Bending matches to hold it would mean either inventing throwaway
-- team rows for every combination (four a round, forty a night, and standings
-- computed over teams that exist for fifteen minutes) or making home/away
-- nullable and teaching every existing query about a case none of them want.
--
-- KotC set the precedent: a format that genuinely doesn't fit gets its own
-- tables and leaves matches/sets/pools/bracket alone. Same here.
--
-- A "pair" is an ordinary `teams` row, which is how beach doubles already works
-- in this app — Ross & Rachel Summer 2026 runs fourteen pairs as fourteen
-- teams. So rosters, invites and registration all work unchanged; only the
-- fixtures and the scoring are new.

alter type "competition_type" add value if not exists 'reverse_pairs';
--> statement-breakpoint

create table if not exists "reverse_pairs_settings" (
  "competition_id" uuid primary key references "competitions"("id") on delete cascade,
  -- Each court holds two teams of three, so six pairs.
  "courts" integer not null default 2,
  -- Rounds in the night. NOT games per pair: with more pairs than court space
  -- some sit out each round, so fifteen pairs over ten rounds is eight games
  -- each. See lib/scheduler/reverse-pairs.ts.
  "rounds" integer not null default 8,
  -- Seeds the draw. Stored so regenerating without changing anything returns
  -- the same schedule rather than reshuffling everybody.
  "seed" integer not null default 1,
  -- Minutes per game, for laying the night out on a clock.
  "minutes_per_game" integer not null default 15,
  "created_at" timestamptz not null default now(),
  constraint "reverse_pairs_settings_courts_check" check ("courts" between 1 and 12),
  constraint "reverse_pairs_settings_rounds_check" check ("rounds" between 1 and 40)
);
--> statement-breakpoint

create table if not exists "reverse_pairs_games" (
  "id" uuid primary key default gen_random_uuid(),
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  -- 1-based round. Every court plays simultaneously within a round.
  "game" integer not null,
  "court" integer not null,
  -- Points for each side. Null until entered; a game is complete when both are.
  -- Standings are point DIFFERENTIAL, so both numbers matter, not just the
  -- winner — losing 25-23 is worth far more than losing 25-12.
  "score_a" integer,
  "score_b" integer,
  "scheduled_at" timestamptz,
  "created_at" timestamptz not null default now(),
  constraint "reverse_pairs_games_unique_slot" unique ("competition_id", "game", "court"),
  constraint "reverse_pairs_games_scores_check"
    check (("score_a" is null) = ("score_b" is null))
);
--> statement-breakpoint

create index if not exists "reverse_pairs_games_competition_idx"
  on "reverse_pairs_games" ("competition_id", "game", "court");
--> statement-breakpoint

-- Which pairs are on which side. Three rows per side, six per game.
--
-- A join table rather than two uuid[] columns: an array cannot carry a foreign
-- key, and a pair that gets deleted would leave an id pointing at nothing in
-- the middle of a schedule.
create table if not exists "reverse_pairs_lineups" (
  "game_id" uuid not null references "reverse_pairs_games"("id") on delete cascade,
  "team_id" uuid not null references "teams"("id") on delete cascade,
  "side" text not null,
  primary key ("game_id", "team_id"),
  constraint "reverse_pairs_lineups_side_check" check ("side" in ('a', 'b'))
);
--> statement-breakpoint

create index if not exists "reverse_pairs_lineups_team_idx"
  on "reverse_pairs_lineups" ("team_id");
--> statement-breakpoint

alter table "reverse_pairs_settings" enable row level security;
--> statement-breakpoint
alter table "reverse_pairs_games" enable row level security;
--> statement-breakpoint
alter table "reverse_pairs_lineups" enable row level security;
--> statement-breakpoint

drop policy if exists "reverse_pairs_settings_select" on "reverse_pairs_settings";
--> statement-breakpoint
create policy "reverse_pairs_settings_select" on "reverse_pairs_settings"
  for select using (public.can_view_competition("competition_id"));
--> statement-breakpoint
drop policy if exists "reverse_pairs_settings_admin_all" on "reverse_pairs_settings";
--> statement-breakpoint
create policy "reverse_pairs_settings_admin_all" on "reverse_pairs_settings"
  for all to authenticated
  using (public.is_competition_admin("competition_id"))
  with check (public.is_competition_admin("competition_id"));
--> statement-breakpoint

drop policy if exists "reverse_pairs_games_select" on "reverse_pairs_games";
--> statement-breakpoint
create policy "reverse_pairs_games_select" on "reverse_pairs_games"
  for select using (public.can_view_competition("competition_id"));
--> statement-breakpoint
drop policy if exists "reverse_pairs_games_admin_all" on "reverse_pairs_games";
--> statement-breakpoint
create policy "reverse_pairs_games_admin_all" on "reverse_pairs_games"
  for all to authenticated
  using (public.is_competition_admin("competition_id"))
  with check (public.is_competition_admin("competition_id"));
--> statement-breakpoint

-- Lineups inherit their game's competition; the subquery is what keeps the
-- policy honest without duplicating competition_id onto every row.
drop policy if exists "reverse_pairs_lineups_select" on "reverse_pairs_lineups";
--> statement-breakpoint
create policy "reverse_pairs_lineups_select" on "reverse_pairs_lineups"
  for select using (
    exists (
      select 1 from reverse_pairs_games g
      where g.id = "game_id" and public.can_view_competition(g.competition_id)
    )
  );
--> statement-breakpoint
drop policy if exists "reverse_pairs_lineups_admin_all" on "reverse_pairs_lineups";
--> statement-breakpoint
create policy "reverse_pairs_lineups_admin_all" on "reverse_pairs_lineups"
  for all to authenticated
  using (
    exists (
      select 1 from reverse_pairs_games g
      where g.id = "game_id" and public.is_competition_admin(g.competition_id)
    )
  )
  with check (
    exists (
      select 1 from reverse_pairs_games g
      where g.id = "game_id" and public.is_competition_admin(g.competition_id)
    )
  );
