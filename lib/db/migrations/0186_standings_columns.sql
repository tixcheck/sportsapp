-- 0186: a league can show pared-down standings (BVL, 2026-10-21).
--
-- BVL wants its standings "dumbed down a lot more": rank, team, sets won,
-- sets lost, +/- and ratio, nothing else. 'full' keeps every column (the
-- default, so no other league changes). Display only: the ranking is the same.
alter table public.league_settings
  add column if not exists standings_columns text not null default 'full';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'league_settings_standings_columns_check'
  ) then
    alter table public.league_settings
      add constraint league_settings_standings_columns_check
      check (standings_columns in ('full', 'simple'));
  end if;
end $$;
