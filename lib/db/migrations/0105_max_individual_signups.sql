-- A cap on individual sign-ups, separate from the team cap.
--
-- Migration 0076 deliberately exempted free agents from `max_teams`: that
-- number caps ENTRANTS, and a league whose team spots are gone may still want
-- a queue of individuals to build another team from. That reasoning still
-- holds — which is exactly why a second, independent number is needed rather
-- than reusing the first.
--
-- Brampton Volleyball League cap theirs at 12–16 a night, because a free agent
-- is a promise: every one of them expects to be placed on a team, and an
-- organizer who takes forty has made forty promises they cannot keep.

alter table "competitions"
  add column if not exists "max_individual_signups" integer;
--> statement-breakpoint

alter table "competitions"
  drop constraint if exists "competitions_max_individuals_check";
--> statement-breakpoint

alter table "competitions"
  add constraint "competitions_max_individuals_check"
  check (
    "max_individual_signups" is null
    or "max_individual_signups" between 1 and 500
  );
--> statement-breakpoint

comment on column "competitions"."max_individual_signups" is
  'Individual sign-ups this competition will take. Null = no limit. Independent of max_teams, which caps entrants.';
--> statement-breakpoint

/**
 * Register a single player, now respecting the individual cap.
 *
 * Replaces the version in migration 0076. The cap is counted INSIDE the
 * function that does the insert, for the same reason the team cap is: two
 * people hitting sign-up at the same instant must not both take the last
 * place.
 *
 * Withdrawn sign-ups free their place back up. Everyone else counts —
 * including `pending_payment`, because an unpaid sign-up is still holding a
 * place, and including `placed`, because someone already on a team has
 * consumed the promise the cap exists to limit.
 *
 * Editing an EXISTING sign-up is never blocked. Someone correcting their
 * positions after the pool filled is not taking a new place, and refusing them
 * would strand their own row in a state they cannot fix.
 */
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
  _cap integer;
  _taken integer;
  _already boolean;
  _id uuid;
begin
  if _uid is null then
    raise exception 'You need to be signed in to sign up.';
  end if;

  select c.type, c.status::text, c.allow_individual_signups,
         c.max_individual_signups
    into _type, _status_col, _allowed, _cap
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

  select exists (
    select 1 from free_agents fa
    where fa.competition_id = _competition_id and fa.user_id = _uid
  ) into _already;

  -- max_teams is still deliberately NOT checked here: it caps entrants, and a
  -- free agent is not one. This is the individual cap, which is its own number.
  if _cap is not null and not _already then
    select count(*) into _taken
      from free_agents fa
     where fa.competition_id = _competition_id
       and fa.status <> 'withdrawn';

    if _taken >= _cap then
      raise exception 'Individual sign-ups are full — all % places have been taken.', _cap;
    end if;
  end if;

  select coalesce(individual_fee_cents, 0) into _fee
    from competition_payment_settings
   where competition_id = _competition_id;

  -- A fee that is charged makes them pending until the payment lands, exactly
  -- as a team is. A free event admits them straight away.
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

/**
 * How full the individual pool is. Null cap means unlimited, and the caller
 * shows no counter at all rather than "0 of ∞".
 */
create or replace function public.individual_fullness(_competition_id uuid)
returns table (cap integer, taken integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.max_individual_signups,
    (select count(*)::int from free_agents fa
      where fa.competition_id = c.id and fa.status <> 'withdrawn')
    from competitions c
   where c.id = _competition_id;
$$;
--> statement-breakpoint

grant execute on function public.individual_fullness(uuid) to authenticated;
--> statement-breakpoint
grant execute on function public.individual_fullness(uuid) to anon;
