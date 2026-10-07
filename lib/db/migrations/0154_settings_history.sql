-- A history of organizer setting changes: who changed what, when, from what
-- to what.
--
-- BVL, 2026-10-07: three leagues' registration deadlines had moved from Oct 3
-- to Oct 7/8/10, and nobody could say who did it — a setting stored only its
-- current value. The owner: "Are we not capturing that information?" Now we
-- are.
--
-- Captured by TRIGGERS, not by the app, so every path is covered — the
-- organizer's form, a phone, a support script — and no future screen can
-- forget to log. One row per FIELD that actually changed (`is distinct
-- from`); saving a form unchanged writes nothing. Only the fields worth
-- knowing about are tracked, listed per table below — registration,
-- capacity, money, waiver, dates, visibility — so automatic bookkeeping
-- (ladder state, seeds) never floods it. A few thousand small rows a year
-- across every org.
--
-- `changed_by` is the signed-in user (auth.uid()); NULL means it didn't come
-- from a person's session — a support script or the platform itself.

create table if not exists "settings_changes" (
  "id" uuid primary key default gen_random_uuid(),
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  "table_name" text not null,
  "field" text not null,
  "old_value" jsonb,
  "new_value" jsonb,
  "changed_by" uuid references "users"("id") on delete set null,
  "changed_at" timestamptz not null default now()
);
--> statement-breakpoint
create index if not exists "settings_changes_competition"
  on "settings_changes" ("competition_id", "changed_at" desc);
--> statement-breakpoint

alter table "settings_changes" enable row level security;
--> statement-breakpoint
drop policy if exists "settings_changes_admin_read" on "settings_changes";
--> statement-breakpoint
create policy "settings_changes_admin_read" on "settings_changes"
  for select using (public.is_competition_admin(competition_id));
--> statement-breakpoint

-- Generic: the tracked fields come in as trigger arguments, the competition
-- is `id` on competitions and `competition_id` everywhere else.
create or replace function public.trg_record_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _old jsonb := to_jsonb(old);
  _new jsonb := to_jsonb(new);
  _comp uuid := coalesce((_new ->> 'competition_id')::uuid, (_new ->> 'id')::uuid);
  _field text;
begin
  if tg_table_name = 'competitions' then
    _comp := (_new ->> 'id')::uuid;
  end if;
  foreach _field in array tg_argv loop
    if (_old -> _field) is distinct from (_new -> _field) then
      insert into settings_changes (competition_id, table_name, field, old_value, new_value, changed_by)
      values (_comp, tg_table_name, _field, _old -> _field, _new -> _field, auth.uid());
    end if;
  end loop;
  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists settings_history on league_settings;
--> statement-breakpoint
create trigger settings_history after update on league_settings
  for each row execute function public.trg_record_settings_change(
    'registration_open', 'registration_deadline', 'max_teams', 'blackout_dates',
    'weekly_slots', 'tiebreaker', 'ladder_swaps', 'wave_swap_weeks', 'session_nights'
  );
--> statement-breakpoint

drop trigger if exists settings_history on tournament_settings;
--> statement-breakpoint
create trigger settings_history after update on tournament_settings
  for each row execute function public.trg_record_settings_change(
    'registration_deadline', 'max_teams', 'pool_size', 'bracket_type',
    'playoff_teams', 'courts', 'minutes_per_game'
  );
--> statement-breakpoint

drop trigger if exists settings_history on reverse_pairs_settings;
--> statement-breakpoint
create trigger settings_history after update on reverse_pairs_settings
  for each row execute function public.trg_record_settings_change(
    'registration_open', 'registration_deadline', 'max_pairs', 'courts',
    'rounds', 'minutes_per_game', 'point_cap'
  );
--> statement-breakpoint

drop trigger if exists settings_history on competition_payment_settings;
--> statement-breakpoint
create trigger settings_history after update on competition_payment_settings
  for each row execute function public.trg_record_settings_change(
    'registration_fee_cents', 'individual_fee_cents', 'payment_required',
    'allow_captain_pays', 'allow_split_payment', 'tax_enabled', 'tax_percent',
    'etransfer_email', 'paypal_team_url', 'paypal_individual_url'
  );
--> statement-breakpoint

drop trigger if exists settings_history on competitions;
--> statement-breakpoint
create trigger settings_history after update on competitions
  for each row execute function public.trg_record_settings_change(
    'name', 'status', 'visibility', 'start_date', 'end_date', 'venue',
    'waiver_id', 'min_roster_for_entry', 'allow_individual_signups',
    'max_individual_signups', 'platform_fee_waived'
  );
