-- Reverse Pairs: register without a partner, and pairs named after their people.
--
-- The owner, 2026-09-30: "the captain doesn't have to add the partner at the
-- time of registration. They might not have a partner when registering ... let
-- the captain invite the teammate when he finds one. Make the team names as
-- FirstName/FirstNamePartner."
--
-- A pair is now named `Dani/TBD` when it signs up alone and becomes `Dani/Mel`
-- the moment Mel is invited by name or joins — whichever way she arrives (the
-- claim link, autolink on sign-up, an organizer adding her). Every one of those
-- paths ends in a write to `team_members` or `team_invites`, so the rename is a
-- trigger there rather than a step each path has to remember.
--
-- `teams.name_is_auto` marks a name the database owns. Any rename that doesn't
-- come from the auto-namer clears it, so an organizer who renames a pair keeps
-- their name — the database never overwrites a name a person chose. Existing
-- pairs default to false: their names were typed and stay as they are.
--
-- Team names are unique per event, so a second `Sam/TBD` becomes `Sam/TBD 2`.

alter table "teams"
  add column if not exists "name_is_auto" boolean not null default false;
--> statement-breakpoint

comment on column "teams"."name_is_auto" is
  'Reverse Pairs: the name is generated (Captain/Partner) and kept in step with the roster. Cleared by any rename that does not come from refresh_reverse_pair_name.';
--> statement-breakpoint

-- The first word of a name; null for a blank one.
create or replace function public.first_name_of(_full text)
returns text
language sql
immutable
as $$
  select nullif(split_part(btrim(coalesce(_full, '')), ' ', 1), '')
$$;
--> statement-breakpoint

-- `Captain/Partner` for a pair, before any de-duplication. The partner is the
-- player who has joined; failing that, the name on a pending invite; failing
-- that, TBD. Mirrored in lib/reverse-pairs/pair-name.ts, which the tests cover.
create or replace function public.reverse_pair_base_name(_team_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           public.first_name_of(cu.display_name),
           public.first_name_of(split_part(cu.email, '@', 1)),
           'Player'
         )
         || '/'
         || coalesce(
           (select public.first_name_of(coalesce(u.display_name, split_part(u.email, '@', 1)))
              from team_members m join users u on u.id = m.user_id
             where m.team_id = t.id and m.role = 'player'
             order by m.created_at
             limit 1),
           (select public.first_name_of(i.name)
              from team_invites i
             where i.team_id = t.id and i.status = 'pending' and i.role = 'player'
             order by i.created_at desc
             limit 1),
           'TBD'
         )
    from teams t
    left join users cu on cu.id = t.captain_user_id
   where t.id = _team_id
$$;
--> statement-breakpoint

-- Bring an auto-named pair's name up to date. A no-op for every other team.
create or replace function public.refresh_reverse_pair_name(_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _comp uuid;
  _auto boolean;
  _current text;
  _base text;
  _name text;
  _n int := 1;
begin
  select t.competition_id, t.name_is_auto, t.name
    into _comp, _auto, _current
    from teams t
   where t.id = _team_id;
  if not found or not _auto then
    return;
  end if;

  _base := public.reverse_pair_base_name(_team_id);
  _name := _base;
  while exists (
    select 1 from teams o
     where o.competition_id = _comp
       and o.id <> _team_id
       and o.status <> 'withdrawn'
       and lower(btrim(o.name)) = lower(_name)
  ) loop
    _n := _n + 1;
    _name := _base || ' ' || _n;
  end loop;

  if _name is distinct from _current then
    -- Tells trg_team_name_owner this rename is ours, so the name stays auto.
    perform set_config('app.reverse_pair_autoname', 'on', true);
    update teams set name = _name where id = _team_id;
    perform set_config('app.reverse_pair_autoname', '', true);
  end if;
end;
$$;
--> statement-breakpoint

revoke all on function public.refresh_reverse_pair_name(uuid) from public;
--> statement-breakpoint

-- A rename by anyone but the auto-namer makes the name theirs.
create or replace function public.trg_team_name_owner()
returns trigger
language plpgsql
as $$
begin
  if new.name is distinct from old.name
     and new.name_is_auto
     and coalesce(current_setting('app.reverse_pair_autoname', true), '') <> 'on' then
    new.name_is_auto := false;
  end if;
  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists team_name_owner on teams;
--> statement-breakpoint
create trigger team_name_owner
  before update of name on teams
  for each row execute function public.trg_team_name_owner();
--> statement-breakpoint

create or replace function public.trg_reverse_pair_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_reverse_pair_name(coalesce(new.team_id, old.team_id));
  return coalesce(new, old);
end;
$$;
--> statement-breakpoint

drop trigger if exists reverse_pair_rename_on_member on team_members;
--> statement-breakpoint
create trigger reverse_pair_rename_on_member
  after insert or delete on team_members
  for each row execute function public.trg_reverse_pair_rename();
--> statement-breakpoint

drop trigger if exists reverse_pair_rename_on_invite on team_invites;
--> statement-breakpoint
create trigger reverse_pair_rename_on_invite
  after insert or update or delete on team_invites
  for each row execute function public.trg_reverse_pair_rename();
--> statement-breakpoint

-- A pair is two people. One partner, joined or invited, at a time: to change
-- partner the captain's old invite is revoked first (inviteTeammateAction does
-- that). Checked here as well because the invite insert is reachable straight
-- through RLS, not only through the action.
create or replace function public.trg_reverse_pair_one_partner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'pending' or new.role <> 'player' then
    return new;
  end if;
  if not exists (
    select 1 from teams t join competitions c on c.id = t.competition_id
     where t.id = new.team_id and c.type = 'reverse_pairs'
  ) then
    return new;
  end if;
  if exists (
    select 1 from team_members m
     where m.team_id = new.team_id and m.role = 'player'
  ) then
    raise exception 'Your pair already has a partner.';
  end if;
  if exists (
    select 1 from team_invites i
     where i.team_id = new.team_id and i.id <> new.id
       and i.status = 'pending' and i.role = 'player'
  ) then
    raise exception 'Your pair already has a partner invited.';
  end if;
  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists reverse_pair_one_partner on team_invites;
--> statement-breakpoint
create trigger reverse_pair_one_partner
  before insert or update of status on team_invites
  for each row execute function public.trg_reverse_pair_one_partner();
--> statement-breakpoint

-- Registration: the pair name is now optional. Blank = auto-named.
create or replace function public.register_reverse_pair(
  _competition_id uuid,
  _pair_name text,
  _partner_email text default null,
  _partner_name text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _visibility text;
  _reg_open boolean;
  _deadline timestamptz;
  _max_pairs int;
  _fee_cents int;
  _payment_required boolean;
  _taken int;
  _team_id uuid;
  _token text;
  _auto boolean := length(btrim(coalesce(_pair_name, ''))) = 0;
begin
  if _uid is null then
    raise exception 'You must be signed in to register.';
  end if;

  select c.visibility::text,
         coalesce(rp.registration_open, false),
         rp.registration_deadline,
         rp.max_pairs,
         coalesce(cps.registration_fee_cents, 0),
         coalesce(cps.payment_required, false)
    into _visibility, _reg_open, _deadline, _max_pairs,
         _fee_cents, _payment_required
    from competitions c
    left join reverse_pairs_settings rp on rp.competition_id = c.id
    left join competition_payment_settings cps on cps.competition_id = c.id
   where c.id = _competition_id and c.type = 'reverse_pairs';

  if _visibility is null then
    raise exception 'Event not found.';
  end if;
  if _visibility is distinct from 'public' then
    raise exception 'Registration is not open for this event.';
  end if;
  if not _reg_open then
    raise exception 'Registration is not open for this event.';
  end if;
  if _deadline is not null and _deadline < now() then
    raise exception 'The registration deadline has passed.';
  end if;

  -- One sign-up per person. Without this a refresh of the confirmation page, or
  -- an impatient second click, quietly enters the same pair twice.
  if exists (
    select 1 from teams t
    where t.competition_id = _competition_id
      and t.captain_user_id = _uid
      and t.status <> 'withdrawn'
  ) then
    raise exception 'You have already registered a pair for this event.';
  end if;

  -- Capacity counted inside the function that inserts, so the last spot cannot
  -- go to two pairs at once. Withdrawn pairs free their spot back up.
  if _max_pairs is not null then
    select count(*) into _taken
      from teams t
     where t.competition_id = _competition_id
       and t.status <> 'withdrawn';
    if _taken >= _max_pairs then
      raise exception 'This event is full.';
    end if;
  end if;

  -- An auto-named pair starts under a throwaway unique name; the refresh at the
  -- end gives it its real one once the captain and partner are recorded.
  insert into teams (competition_id, name, name_is_auto, captain_user_id, status)
  values (
    _competition_id,
    case when _auto then 'pair-' || gen_random_uuid()::text else btrim(_pair_name) end,
    _auto,
    _uid,
    case when _payment_required and _fee_cents > 0
         then 'pending_payment'::team_status
         else 'active'::team_status
    end
  )
  returning id into _team_id;

  insert into team_members (team_id, user_id, role)
  values (_team_id, _uid, 'captain')
  on conflict do nothing;

  -- The partner, if one was given. An invite rather than a bare row, so they
  -- claim their own place and end up with an account of their own.
  if length(btrim(coalesce(_partner_email, ''))) > 0 then
    -- gen_random_uuid lives in pg_catalog and is always reachable; the
    -- pgcrypto gen_random_bytes is in `extensions`, which this function's
    -- `search_path = public` deliberately excludes. Same construction
    -- register_team uses.
    _token := replace(gen_random_uuid()::text, '-', '')
           || replace(gen_random_uuid()::text, '-', '');
    insert into team_invites (team_id, email, name, token, role, invited_by_user_id)
    values (
      _team_id,
      lower(btrim(_partner_email)),
      nullif(btrim(coalesce(_partner_name, '')), ''),
      _token,
      'player',
      _uid
    );
  end if;

  perform public.refresh_reverse_pair_name(_team_id);
  return _team_id;
end;
$$;
--> statement-breakpoint

comment on function public.register_reverse_pair is
  'Sign a pair up for a Reverse Pairs event. Enforces public visibility, registration open, deadline and capacity. A blank pair name means Captain/Partner, kept in step by refresh_reverse_pair_name. Unpaid pairs enter as pending_payment.';
