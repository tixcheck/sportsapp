-- 0190: Security audit, batch 2 (2026-10-30).
--
-- 1. Rate limits. Several actions send email or spend a paid API on behalf of
--    whoever calls them: a captain's invites, the "you already have an
--    account" email a sign-up triggers, Google Places lookups. Serverless
--    instances share no memory, so the count lives here. `take_rate_limit`
--    picks the subject itself for per-user buckets (auth.uid()), so a caller
--    can only spend their own allowance; the per-address bucket takes the
--    address, and the worst a stranger can do with it is delay that address's
--    next "account exists" email by an hour, which they could cause anyway.
-- 2. teams.admitted_unpaid_note / admitted_unpaid_by were readable by anyone
--    through the API (teams_select is public for a public competition, and
--    RLS is per row, not per column). Nothing in the app reads them; they move
--    to an organizer-only table, written by admit_team_unpaid as before.
-- 3. Definer functions anyone could call that only triggers and other definer
--    functions need: fill_roster_appearances (let a stranger add appearance
--    rows to any game), alignment_advance, reverse_pair_base_name (falls back
--    to the start of an email address), platform_fee_debts (any org's unpaid
--    platform fees). Called from inside definer functions they still run as
--    the owner, so revoking direct execution changes nothing for the app.
-- 4. org_payment_account returned any organization's Stripe account to anyone,
--    signed in or not. Now signed-in only (see below for why not narrower).

create table if not exists public.rate_limit_events (
  bucket text not null,
  subject text not null,
  at timestamptz not null default now()
);
--> statement-breakpoint
create index if not exists rate_limit_events_lookup
  on public.rate_limit_events (bucket, subject, at);
--> statement-breakpoint
-- No policies: only take_rate_limit (definer) touches it.
alter table public.rate_limit_events enable row level security;
--> statement-breakpoint

create or replace function public.take_rate_limit(_bucket text, _subject text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _max integer;
  _window interval;
  _key text;
  _used integer;
begin
  -- The limits live here, not with the caller, so a caller can't raise them.
  case _bucket
    when 'account_exists' then
      _max := 1; _window := interval '1 hour';
      _key := lower(btrim(coalesce(_subject, '')));
    when 'invite' then
      _max := 40; _window := interval '1 day';
      _key := auth.uid()::text;
    when 'places' then
      _max := 300; _window := interval '1 day';
      _key := auth.uid()::text;
    else
      raise exception 'Unknown rate limit %.', _bucket;
  end case;
  if _key is null or _key = '' then
    return false;
  end if;

  -- One caller at a time per key, so a burst can't all read "under the limit".
  perform pg_advisory_xact_lock(hashtext(_bucket || ':' || _key));
  delete from rate_limit_events
   where bucket = _bucket and subject = _key and at < now() - _window;
  select count(*) into _used from rate_limit_events
   where bucket = _bucket and subject = _key;
  if _used >= _max then
    return false;
  end if;
  insert into rate_limit_events (bucket, subject) values (_bucket, _key);
  return true;
end;
$$;
--> statement-breakpoint
revoke all on function public.take_rate_limit(text, text) from public;
--> statement-breakpoint
grant execute on function public.take_rate_limit(text, text) to anon, authenticated, service_role;
--> statement-breakpoint

create table if not exists public.team_unpaid_admissions (
  team_id uuid primary key references public.teams(id) on delete cascade,
  admitted_by uuid references public.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
--> statement-breakpoint
alter table public.team_unpaid_admissions enable row level security;
--> statement-breakpoint
drop policy if exists team_unpaid_admissions_admin_read on public.team_unpaid_admissions;
--> statement-breakpoint
create policy team_unpaid_admissions_admin_read on public.team_unpaid_admissions
  for select to authenticated
  using (exists (
    select 1 from public.teams t
     where t.id = team_id and public.is_competition_admin(t.competition_id)
  ));
--> statement-breakpoint

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'teams'
       and column_name = 'admitted_unpaid_note'
  ) then
    insert into public.team_unpaid_admissions (team_id, admitted_by, note, created_at)
    select id, admitted_unpaid_by, admitted_unpaid_note, coalesce(admitted_unpaid_at, now())
      from public.teams
     where admitted_unpaid_by is not null or admitted_unpaid_note is not null
    on conflict (team_id) do nothing;
  end if;
end $$;
--> statement-breakpoint

create or replace function public.admit_team_unpaid(_team_id uuid, _note text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _competition uuid;
  _status team_status;
begin
  select t.competition_id, t.status into _competition, _status
  from teams t where t.id = _team_id;

  if _competition is null then
    raise exception 'That team does not exist.';
  end if;

  if not public.is_competition_admin(_competition) then
    raise exception 'Only an organizer can admit a team that has not paid.';
  end if;
  if _status <> 'pending_payment' then
    return false;
  end if;

  update teams
  set status = 'active',
      payment_mode = null,
      admitted_unpaid_at = now()
  where id = _team_id and status = 'pending_payment';

  -- Who let them in and why: organizer-only (0190), not on the public row.
  insert into team_unpaid_admissions (team_id, admitted_by, note)
  values (_team_id, auth.uid(), nullif(btrim(coalesce(_note, '')), ''))
  on conflict (team_id) do update
    set admitted_by = excluded.admitted_by,
        note = excluded.note,
        created_at = now();

  return true;
end;
$$;
--> statement-breakpoint

alter table public.teams drop column if exists admitted_unpaid_note;
--> statement-breakpoint
alter table public.teams drop column if exists admitted_unpaid_by;
--> statement-breakpoint

revoke all on function public.fill_roster_appearances(uuid) from public, anon, authenticated;
--> statement-breakpoint
revoke all on function public.alignment_advance(uuid) from public, anon, authenticated;
--> statement-breakpoint
revoke all on function public.reverse_pair_base_name(uuid) from public, anon, authenticated;
--> statement-breakpoint
revoke all on function public.platform_fee_debts(uuid) from public, anon, authenticated;
--> statement-breakpoint

-- Signed-in only, not organizers only: a player's card checkout reads the
-- org's connected account through it (registration-payments.ts), and a Stripe
-- account id is not a secret (it rides on every checkout).
revoke all on function public.org_payment_account(uuid, boolean) from public, anon;
--> statement-breakpoint
grant execute on function public.org_payment_account(uuid, boolean) to authenticated, service_role;
