-- One signature per waiver, not one per league.
--
-- The owner, 2026-10-01: "one waiver is enough for the org." Mango attached the
-- waiver its Coed league already used to Friday Mens, and every Mens team was
-- held: seven of the eight players had signed that exact document for Coed,
-- but a signature counted only for the competition it was given in.
--
-- A waiver belongs to an organization and is identified by `waiver_id`; the
-- document a player agreed to is the same whichever of the org's leagues asked.
-- So "has signed" is now (user, waiver) — `competition_id` stays on the
-- acceptance as the record of where they signed, and is no longer part of the
-- test. A new or replaced waiver is a different `waiver_id` and still needs a
-- fresh signature, which is the point of versioning it.
--
-- Three places decide it in the database: the entry gate, the "waiver to sign"
-- prompt, and the trigger that re-checks a signer's teams — which now
-- re-checks their teams in every competition using that waiver, so signing
-- once releases all of them.

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
    -- Someone on the roster hasn't signed this waiver — in any of the org's
    -- competitions. Every member must, which is why adding a player later
    -- re-opens the gate.
    when c.waiver_id is not null
      and exists (
        select 1 from team_members tm
        where tm.team_id = t.id
          and not exists (
            select 1 from waiver_acceptances a
            where a.waiver_id = c.waiver_id
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

create or replace function public.waiver_outstanding(
  _competition_id uuid,
  _user_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from competitions c
    where c.id = _competition_id
      and c.waiver_id is not null
      and not exists (
        select 1 from waiver_acceptances a
        where a.waiver_id = c.waiver_id
          and a.user_id = coalesce(_user_id, auth.uid())
      )
  );
$$;
--> statement-breakpoint

create or replace function public.trg_waiver_acceptance_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_team_entry_status(t.id)
    from teams t
    join competitions c on c.id = t.competition_id
    join team_members tm on tm.team_id = t.id
   where c.waiver_id = new.waiver_id
     and tm.user_id = new.user_id;
  return new;
end;
$$;
