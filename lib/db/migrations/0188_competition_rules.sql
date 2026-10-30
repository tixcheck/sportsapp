-- 0188: A league's own rules (Big Shoots, 2026-10-29).
--
-- Shown on the league's Rules tab and given to the Help assistant, so a player
-- can ask "is a double on the set legal?" and get the organizer's answer. An
-- array of sections (see lib/competition/rules.ts); plain text throughout.
-- On competitions rather than league_settings so a tournament can use it too.
-- Null = no rules published. Organizers edit it through the same RLS update
-- policy as the description.
alter table public.competitions
  add column if not exists rules jsonb;
--> statement-breakpoint

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'competitions_rules_is_array'
  ) then
    alter table public.competitions
      add constraint competitions_rules_is_array
      check (rules is null or jsonb_typeof(rules) = 'array');
  end if;
end $$;
