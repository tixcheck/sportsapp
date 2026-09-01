-- A team isn't an entrant until its players have signed.
--
-- BVL's rule: a registered team is pending until it has a full roster and every
-- one of those players has agreed to the waiver, and adding somebody later
-- re-opens it until they sign too. That is a liability requirement, so it has
-- to be a gate rather than a reminder — an unsigned player taking the court is
-- exactly what the waiver exists to prevent.
--
-- `pending_waiver` joins `pending_payment` as a reason a team is not yet
-- playing. The two are separate because they are resolved by different people:
-- money by the captain, signatures by each player.
--
-- IMPORTANT: every query that decides who is an entrant previously asked "is
-- the status NOT pending_payment", which would let this new value straight
-- through — and, as it happens, has always let `withdrawn` through too. Those
-- filters become "is the status active", which is what they always meant.
--
-- Nothing changes for an existing competition: `min_roster_for_entry` is null
-- and `waiver_id` is null everywhere, so `team_entry_blocked` returns false and
-- no team's status moves.

alter type "team_status" add value if not exists 'pending_waiver';
--> statement-breakpoint

-- How many rostered players a team needs before it counts as entered. Null =
-- no requirement, which is every competition until an organizer sets one.
alter table "competitions"
  add column if not exists "min_roster_for_entry" integer;
--> statement-breakpoint

alter table "competitions"
  drop constraint if exists "competitions_min_roster_check";
--> statement-breakpoint
alter table "competitions"
  add constraint "competitions_min_roster_check"
  check ("min_roster_for_entry" is null or "min_roster_for_entry" between 1 and 30);
--> statement-breakpoint

comment on column "competitions"."min_roster_for_entry" is
  'Rostered players required before a team is a confirmed entrant. Null = no requirement.';
--> statement-breakpoint

/**
 * Why a team is not yet an entrant, or null when it is one.
 *
 * Two independent conditions, both owned by the competition:
 *   - a full enough roster (min_roster_for_entry)
 *   - every rostered player having signed the waiver (waiver_id)
 *
 * Returns the reason rather than a boolean so the UI can say which it is; a
 * team told only "pending" has no idea whose signature is missing.
 */
create or replace function public.team_entry_blocked(_team_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when c.id is null then null
    -- Roster too small to enter at all.
    when c.min_roster_for_entry is not null
      and (select count(*) from team_members tm where tm.team_id = t.id)
          < c.min_roster_for_entry
      then 'roster'
    -- Someone on the roster hasn't signed. Every member must, which is why
    -- adding a player later re-opens the gate.
    when c.waiver_id is not null
      and exists (
        select 1 from team_members tm
        where tm.team_id = t.id
          and not exists (
            select 1 from waiver_acceptances a
            where a.competition_id = c.id
              and a.waiver_id = c.waiver_id
              and a.user_id = tm.user_id
          )
      )
      then 'waiver'
    else null
  end
  from teams t
  join competitions c on c.id = t.competition_id
  where t.id = _team_id;
$$;
--> statement-breakpoint

grant execute on function public.team_entry_blocked(uuid) to authenticated;
--> statement-breakpoint

/**
 * Keep a team's status honest whenever something that decides it changes.
 *
 * Deliberately never touches `withdrawn` (an organizer's decision, not a
 * computed one) or `pending_payment` (money is a separate gate and resolving
 * waivers must not pretend an unpaid team has paid).
 */
create or replace function public.sync_team_entry_status(_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _status team_status;
  _blocked text;
begin
  select status into _status from teams where id = _team_id;
  if _status is null or _status in ('withdrawn', 'pending_payment') then
    return;
  end if;

  _blocked := public.team_entry_blocked(_team_id);

  if _blocked is not null and _status <> 'pending_waiver' then
    update teams set status = 'pending_waiver' where id = _team_id;
  elsif _blocked is null and _status = 'pending_waiver' then
    update teams set status = 'active' where id = _team_id;
  end if;
end;
$$;
--> statement-breakpoint

-- Signing promotes a team the moment it becomes the last signature needed.
create or replace function public.trg_waiver_acceptance_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_team_entry_status(t.id)
    from teams t
    join team_members tm on tm.team_id = t.id
   where t.competition_id = new.competition_id
     and tm.user_id = new.user_id;
  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists "waiver_acceptance_syncs_team" on "waiver_acceptances";
--> statement-breakpoint
create trigger "waiver_acceptance_syncs_team"
  after insert on "waiver_acceptances"
  for each row execute function public.trg_waiver_acceptance_sync();
--> statement-breakpoint

-- Adding a player re-opens the gate; removing one can close it.
create or replace function public.trg_team_member_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_team_entry_status(coalesce(new.team_id, old.team_id));
  return coalesce(new, old);
end;
$$;
--> statement-breakpoint

drop trigger if exists "team_member_syncs_team" on "team_members";
--> statement-breakpoint
create trigger "team_member_syncs_team"
  after insert or delete on "team_members"
  for each row execute function public.trg_team_member_sync();
--> statement-breakpoint

/**
 * A team being activated from anywhere — a Stripe webhook, an organizer, a
 * registration RPC — is checked against the waiver gate on the way past.
 *
 * A BEFORE trigger rather than asking every caller to remember, because
 * "remember to check" across a dozen call sites is how a gate stops being one.
 */
create or replace function public.trg_team_status_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _required boolean;
begin
  if new.status <> 'active' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- The row does not exist yet, so `team_entry_blocked` cannot see it. It
    -- does not need to: a team being created has no members, so ANY
    -- requirement is by definition unmet.
    select (c.min_roster_for_entry is not null and c.min_roster_for_entry > 0)
           or c.waiver_id is not null
      into _required
      from competitions c
     where c.id = new.competition_id;

    if coalesce(_required, false) then
      new.status := 'pending_waiver';
    end if;
    return new;
  end if;

  -- Registration CREATES a team, so a guard that only watched updates would be
  -- absent at the one moment it matters most — hence both.
  if old.status is distinct from 'active'
     and public.team_entry_blocked(new.id) is not null then
    new.status := 'pending_waiver';
  end if;
  return new;
end;
$$;
--> statement-breakpoint

drop trigger if exists "team_status_guard" on "teams";
--> statement-breakpoint
create trigger "team_status_guard"
  before insert or update on "teams"
  for each row execute function public.trg_team_status_guard();
