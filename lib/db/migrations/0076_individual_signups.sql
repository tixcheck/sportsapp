-- Individual sign-ups ("free agents") — people who want to play but have no team.
--
-- Most leagues take both: teams that arrive intact, and individuals the
-- organizer places. Until now the app only modelled the first.
--
-- WHY A SEPARATE TABLE, and not a placeholder team.
--
-- The obvious shortcut is to create a `teams` row per free agent, or one shared
-- "Free Agents" team, and hang everything off that. It is the wrong shape. A
-- team row is an ENTRANT: the schedule generator reads `teams`, standings are
-- computed per team, the payments dashboard counts teams, and the public page
-- lists them. A free agent is none of those things — they are a person waiting
-- to be placed. Modelling them as a team means every one of those readers needs
-- a new exclusion, and the day one is forgotten a free agent turns up in a
-- fixture. A person is not a team, so they get their own table.
--
-- The organizer later turns free agents into a real team (or drops them onto a
-- team that is short), and THAT is when a `teams` row appears.

-- @separate-transaction: a new enum value is not usable until its own
-- transaction commits (same rule as `pending_payment` in migration 0066).
alter type "registration_payment_kind" add value if not exists 'individual';
--> statement-breakpoint

-- How strong a player says they are. Deliberately a shared enum rather than a
-- per-sport one: these four rungs are how rec leagues talk about level
-- generally, and an organizer reading a mixed list wants one scale.
do $$ begin
  create type "skill_level" as enum (
    'rec',
    'rec_intermediate',
    'intermediate',
    'competitive'
  );
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

do $$ begin
  create type "free_agent_status" as enum (
    -- Signed up, fee outstanding. Not yet offered to the organizer as
    -- available, exactly as `pending_payment` works for a team.
    'pending_payment',
    -- Signed up and waiting to be placed.
    'available',
    -- The organizer has put them on a team. `placed_team_id` says which.
    'placed',
    -- Pulled out, or the organizer removed them. Kept, not deleted, so a
    -- refund still has something to point at.
    'withdrawn'
  );
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- The organizer's choice, per competition — leagues and tournaments alike, so
-- it lives on `competitions` rather than `league_settings`. Off by default: an
-- event that has never thought about free agents should not start taking them.
alter table "competitions"
  add column if not exists "allow_individual_signups" boolean not null default false;
--> statement-breakpoint

create table if not exists "free_agents" (
  "id" uuid primary key default gen_random_uuid() not null,
  "competition_id" uuid not null references "competitions"("id") on delete cascade,
  -- Sign-up requires an account, same as team registration, so this is always
  -- set on the way in. `set null` rather than cascade: if the account goes, the
  -- organizer must still be able to see who they were expecting.
  "user_id" uuid references "users"("id") on delete set null,
  "name" text not null,
  "email" text not null,
  "phone" text,
  -- Positions the player is comfortable in, most-preferred first. Sport-specific
  -- (volleyball has five; another sport has its own), so the allowed values are
  -- validated in the app against lib/sports.ts rather than pinned by a check
  -- constraint here — a DB check would hard-code volleyball into every sport.
  -- Bounded so a malformed client cannot write an unbounded array.
  "positions" text[] not null default '{}',
  "skill_level" skill_level not null,
  -- Anything else they want the organizer to know ("can only make 8pm starts").
  "notes" text,
  "status" free_agent_status not null default 'available',
  -- Set when the organizer places them. `set null` so deleting a team returns
  -- the player to the pool rather than deleting the person.
  "placed_team_id" uuid references "teams"("id") on delete set null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),

  constraint "free_agents_name_not_blank" check (btrim("name") <> ''),
  constraint "free_agents_email_shape" check ("email" ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  constraint "free_agents_positions_bounded" check (
    array_length("positions", 1) is null or array_length("positions", 1) <= 8
  ),
  constraint "free_agents_notes_len" check ("notes" is null or length("notes") <= 1000),
  -- 'placed' is the one status that requires a team, and the only one allowed
  -- to name one. Otherwise a stale `placed_team_id` could outlive a removal.
  constraint "free_agents_placed_has_team" check (
    ("status" = 'placed') = ("placed_team_id" is not null)
  ),
  -- One sign-up per person per competition. Without this, a double-submit or a
  -- second tab quietly bills someone twice.
  constraint "free_agents_one_per_user" unique ("competition_id", "user_id")
);
--> statement-breakpoint

create index if not exists "free_agents_competition_idx"
  on "free_agents" ("competition_id");
--> statement-breakpoint
create index if not exists "free_agents_user_idx"
  on "free_agents" ("user_id");
--> statement-breakpoint
create index if not exists "free_agents_placed_team_idx"
  on "free_agents" ("placed_team_id") where "placed_team_id" is not null;
--> statement-breakpoint

alter table "free_agents" enable row level security;
--> statement-breakpoint

-- Free agents are NOT public. The row carries an email, a phone number and a
-- self-assessed skill level — the last of which is exactly the sort of thing
-- nobody wants published next to their name. The organizer sees the list; a
-- player sees only their own row.
create policy "free_agents_select" on "free_agents"
  for select to authenticated
  using (
    public.is_competition_admin("competition_id")
    or "user_id" = (select auth.uid())
  );
--> statement-breakpoint

-- Inserts go through register_individual() below, which checks that the event
-- is open and taking individuals. No insert policy = direct inserts are denied,
-- so the open/closed rule cannot be skipped by talking to PostgREST.

-- The organizer places, un-places, and withdraws.
create policy "free_agents_admin_write" on "free_agents"
  for update to authenticated
  using (public.is_competition_admin("competition_id"))
  with check (public.is_competition_admin("competition_id"));
--> statement-breakpoint

create policy "free_agents_admin_delete" on "free_agents"
  for delete to authenticated
  using (public.is_competition_admin("competition_id"));
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

-- What one individual pays. Independent of the team fee: a league might charge
-- $400 a team and $65 a head, and neither derives from the other.
alter table "competition_payment_settings"
  add column if not exists "individual_fee_cents" integer not null default 0;
--> statement-breakpoint

do $$ begin
  alter table "competition_payment_settings"
    add constraint "competition_payment_settings_individual_fee_nonneg"
    check ("individual_fee_cents" >= 0);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- A payment now belongs to EITHER a team or a free agent. `team_id` was
-- not-null; it can't stay that way without inventing the placeholder team this
-- migration exists to avoid.
alter table "registration_payments"
  alter column "team_id" drop not null;
--> statement-breakpoint

alter table "registration_payments"
  add column if not exists "free_agent_id" uuid
  references "free_agents"("id") on delete cascade;
--> statement-breakpoint

-- Exactly one payer. Belt and braces around the nullable column above: every
-- existing row has a team and no free agent, so this holds on the way in.
do $$ begin
  alter table "registration_payments"
    add constraint "registration_payments_one_payer"
    check (("team_id" is not null) <> ("free_agent_id" is not null));
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

create index if not exists "registration_payments_free_agent_idx"
  on "registration_payments" ("free_agent_id") where "free_agent_id" is not null;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- register_individual — the only way a free agent row is created.
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER for the same reason register_team is: the open/closed rule
-- and the row insert have to happen together, and the caller must not be able
-- to do the second without the first.
create or replace function public.register_individual(
  _competition_id uuid,
  _name text,
  _email text,
  _phone text,
  _positions text[],
  _skill_level skill_level,
  _notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _type text;
  _status_col text;
  _allowed boolean;
  _open boolean;
  _deadline timestamptz;
  _fee integer;
  _status free_agent_status;
  _id uuid;
begin
  if _uid is null then
    raise exception 'You need to be signed in to sign up.';
  end if;

  select c.type, c.status::text, c.allow_individual_signups
    into _type, _status_col, _allowed
    from competitions c
   where c.id = _competition_id;

  if not found then
    raise exception 'Unknown competition.';
  end if;

  if not coalesce(_allowed, false) then
    raise exception 'This event is not taking individual sign-ups.';
  end if;

  -- Mirrors getRegistrationEvent exactly: a league opens by its own flag and
  -- keeps its deadline in league_settings; a tournament opens by status and
  -- keeps its deadline in tournament_settings. Two tables, one rule.
  if _type = 'league' then
    select coalesce(ls.registration_open, false), ls.registration_deadline
      into _open, _deadline
      from league_settings ls
     where ls.competition_id = _competition_id;
    _open := coalesce(_open, false);
  else
    _open := (_status_col = 'open');
    select ts.registration_deadline into _deadline
      from tournament_settings ts
     where ts.competition_id = _competition_id;
  end if;

  if not _open then
    raise exception 'Registration is closed.';
  end if;

  if _deadline is not null and now() > _deadline then
    raise exception 'Registration is closed.';
  end if;

  -- NOTE: max_teams is deliberately NOT checked. It caps entrants, and a free
  -- agent is not one — a league whose team spots are gone may still want a
  -- waiting list of individuals to build another team from.

  select coalesce(individual_fee_cents, 0) into _fee
    from competition_payment_settings
   where competition_id = _competition_id;

  -- A fee that is charged makes them pending until the webhook says otherwise,
  -- exactly as a team is. A free event admits them straight away.
  _status := case when coalesce(_fee, 0) > 0
                  then 'pending_payment'::free_agent_status
                  else 'available'::free_agent_status end;

  insert into free_agents
    (competition_id, user_id, name, email, phone, positions, skill_level,
     notes, status)
  values
    (_competition_id, _uid, btrim(_name), lower(btrim(_email)),
     nullif(btrim(coalesce(_phone, '')), ''), coalesce(_positions, '{}'),
     _skill_level, nullif(btrim(coalesce(_notes, '')), ''), _status)
  -- Signing up twice edits the first sign-up rather than erroring: someone
  -- correcting their positions should not hit a constraint violation. The
  -- status is left alone so a paid player is never knocked back to pending.
  on conflict ("competition_id", "user_id") do update
    set name = excluded.name,
        email = excluded.email,
        phone = excluded.phone,
        positions = excluded.positions,
        skill_level = excluded.skill_level,
        notes = excluded.notes,
        updated_at = now()
  returning id into _id;

  return _id;
end;
$$;
--> statement-breakpoint

revoke all on function public.register_individual(
  uuid, text, text, text, text[], skill_level, text
) from public;
--> statement-breakpoint

grant execute on function public.register_individual(
  uuid, text, text, text, text[], skill_level, text
) to authenticated;
