-- Reverse Pairs: how the standings rank, and bonus points.
--
-- Offlimits Sports (2026-10-30) ranks by WINS first, then the share of points
-- a pair's sides scored — not by point differential, which is every other
-- Reverse Pairs night. And their Halloween night gives costume bonuses: +2 for
-- one player in costume, +2 more for both, +2 more for matching, added to the
-- pair's points FOR (in every game they play: decided the same day, in
-- lib/stats/reverse-pairs.ts; the rows here are unchanged by it).
--
-- `ranking`: 'differential' (the existing order) or 'wins_pct'.
-- `bonus_items`: what the organizer can award, [{label, points}], or null for
-- none. Awards are rows in reverse_pairs_bonuses with the points copied in, so
-- editing an item later does not silently rewrite a finished night.

alter table "reverse_pairs_settings"
  add column if not exists "ranking" text not null default 'differential';
--> statement-breakpoint
alter table "reverse_pairs_settings"
  add column if not exists "bonus_items" jsonb;
--> statement-breakpoint
do $$ begin
  alter table "reverse_pairs_settings"
    add constraint "reverse_pairs_settings_ranking_check"
    check ("ranking" in ('differential', 'wins_pct'));
exception when duplicate_object then null; end $$;
--> statement-breakpoint
do $$ begin
  alter table "reverse_pairs_settings"
    add constraint "reverse_pairs_settings_bonus_items_check"
    check ("bonus_items" is null
      or (jsonb_typeof("bonus_items") = 'array' and jsonb_array_length("bonus_items") <= 10));
exception when duplicate_object then null; end $$;
--> statement-breakpoint

create table if not exists "reverse_pairs_bonuses" (
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  "team_id" uuid not null references "teams"("id") on delete cascade,
  "item" text not null,
  "points" integer not null,
  "created_at" timestamptz not null default now(),
  primary key ("team_id", "item"),
  constraint "reverse_pairs_bonuses_item_check" check (char_length("item") between 1 and 60),
  constraint "reverse_pairs_bonuses_points_check" check ("points" between -99 and 99)
);
--> statement-breakpoint
create index if not exists "reverse_pairs_bonuses_competition_idx"
  on "reverse_pairs_bonuses" ("competition_id");
--> statement-breakpoint

-- A bonus belongs to a pair in the same event: an admin of one event must not
-- hang rows off another event's team.
create or replace function public.reverse_pairs_bonus_same_event()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from teams t
    where t.id = new.team_id and t.competition_id = new.competition_id
  ) then
    raise exception 'That pair is not in this event.';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke execute on function public.reverse_pairs_bonus_same_event() from public, anon, authenticated;
--> statement-breakpoint
drop trigger if exists reverse_pairs_bonus_same_event on "reverse_pairs_bonuses";
--> statement-breakpoint
create trigger reverse_pairs_bonus_same_event
  before insert or update on "reverse_pairs_bonuses"
  for each row execute function public.reverse_pairs_bonus_same_event();
--> statement-breakpoint

alter table "reverse_pairs_bonuses" enable row level security;
--> statement-breakpoint
drop policy if exists "reverse_pairs_bonuses_select" on "reverse_pairs_bonuses";
--> statement-breakpoint
create policy "reverse_pairs_bonuses_select" on "reverse_pairs_bonuses"
  for select using (public.can_view_competition("competition_id"));
--> statement-breakpoint
drop policy if exists "reverse_pairs_bonuses_admin_all" on "reverse_pairs_bonuses";
--> statement-breakpoint
create policy "reverse_pairs_bonuses_admin_all" on "reverse_pairs_bonuses"
  for all to authenticated
  using (public.is_competition_admin("competition_id"))
  with check (public.is_competition_admin("competition_id"));
--> statement-breakpoint
revoke all on "reverse_pairs_bonuses" from anon;
--> statement-breakpoint
grant select on "reverse_pairs_bonuses" to anon;
--> statement-breakpoint

-- Settings history: the ranking is a setting an organizer would want to see
-- the history of.
drop trigger if exists settings_history on reverse_pairs_settings;
--> statement-breakpoint
create trigger settings_history after update on reverse_pairs_settings
  for each row execute function public.trg_record_settings_change(
    'registration_open', 'registration_deadline', 'max_pairs', 'courts',
    'rounds', 'minutes_per_game', 'point_cap', 'ranking'
  );
