-- 0189: Security audit, batch 1 (2026-10-30).
--
-- 1. offer_next_waitlist_spot was callable by anyone, signed in or not, and
--    returns the offered entry with its contact emails and claim token, which
--    is all it takes to claim that team's spot (claim_waitlist_spot trusts
--    whoever holds the token). Only a competition admin (removing or
--    withdrawing a team) and the waitlist cron (secret key, no auth.uid())
--    call it, so that is who may.
-- 2. matches_captain_insert (0001) let a captain insert a match into ANY
--    competition, since it only checked they captain one of the teams. No app
--    path has captains create matches; organizers go through matches_admin_all.
-- 3. matches_guard_scorer_update (0168) refused a scorekeeper recording a
--    double default, because double_default wasn't among the columns a
--    non-admin scorer may change. Scorekeepers may record defaults (the
--    score screen offers them "Default"); players still may not.

create or replace function public.offer_next_waitlist_spot(
  _competition_id uuid,
  _division_id uuid default null
)
returns waitlist_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  _hours integer;
  _entry waitlist_entries;
begin
  -- SECURITY DEFINER bypasses RLS, so the caller is checked here. No uid is
  -- the cron's secret-key client: anon can no longer execute this at all.
  if auth.uid() is not null and not public.is_competition_admin(_competition_id) then
    raise exception 'Only an organizer can offer a waitlist spot.';
  end if;

  if public.competition_is_full(_competition_id, _division_id) then
    return null;
  end if;

  select coalesce(c.waitlist_claim_hours, 48) into _hours
    from competitions c where c.id = _competition_id;

  select * into _entry
    from waitlist_entries w
   where w.competition_id = _competition_id
     and w.status = 'waiting'
     and (_division_id is null or w.division_id is not distinct from _division_id)
   order by w.created_at
   for update skip locked
   limit 1;

  if _entry.id is null then
    return null;
  end if;

  update waitlist_entries
     set status = 'offered',
         offered_at = now(),
         offer_expires_at = now() + make_interval(hours => _hours),
         claim_token = replace(gen_random_uuid()::text, '-', '')
                    || replace(gen_random_uuid()::text, '-', ''),
         updated_at = now()
   where id = _entry.id
  returning * into _entry;

  return _entry;
end;
$$;
--> statement-breakpoint

-- Supabase grants new functions to anon by default, so PUBLIC alone isn't enough.
revoke all on function public.offer_next_waitlist_spot(uuid, uuid) from public, anon;
--> statement-breakpoint
grant execute on function public.offer_next_waitlist_spot(uuid, uuid) to authenticated, service_role;
--> statement-breakpoint

drop policy if exists matches_captain_insert on public.matches;
--> statement-breakpoint

create or replace function public.matches_guard_scorer_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if public.is_competition_admin(old.competition_id) then
    return new;
  end if;
  if (to_jsonb(new) - 'status' - 'is_abnormal' - 'double_default')
     is distinct from (to_jsonb(old) - 'status' - 'is_abnormal' - 'double_default') then
    raise exception 'Only an organizer can change a game''s time, court or teams.';
  end if;
  if new.is_abnormal and not old.is_abnormal then
    raise exception 'Only an organizer can record an abnormal result.';
  end if;
  if new.double_default is distinct from old.double_default
     and not public.is_competition_scorekeeper(old.competition_id) then
    raise exception 'Only an organizer or scorekeeper can record a default.';
  end if;
  return new;
end;
$$;
