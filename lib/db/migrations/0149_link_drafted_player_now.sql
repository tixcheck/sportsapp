-- Link a drafted player to their existing account as soon as the organizer has
-- their email — not the next time the player happens to sign in.
--
-- Mango Friday Mens, 2026-10-01: Matthew had an account since Sep 22 (Coed).
-- His drafted Team 3 row carried his email but no `user_id`, because
-- `claim_free_agent_signups` only runs on the PLAYER's own dashboard load and
-- he hadn't been back. So the Players tab listed him twice — his account
-- (added to Team 3 separately) as Joined, the drafted row as Not joined — and
-- the new invite email (0147) told a man with an account to go and make one.
--
-- This is the same rule as `claim_free_agent_signups`, for one row, run by an
-- organizer of that competition: match the email to an account, skip if that
-- account already has its own row in the competition, link it, and join the
-- roster as 'player' when the row is placed. `inviteDraftedPlayers` calls it
-- before deciding who to email, so every path that sets an email or places a
-- player links first and only emails people who really have no account.

create or replace function public.link_free_agent_account(_free_agent_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _row free_agents%rowtype;
  _uid uuid;
begin
  select * into _row from free_agents where id = _free_agent_id;
  if not found or _row.user_id is not null or _row.email is null then
    return false;
  end if;
  if not public.is_competition_admin(_row.competition_id) then
    raise exception 'Only an organizer can link a player.';
  end if;

  select u.id into _uid from users u
   where lower(btrim(u.email)) = lower(btrim(_row.email))
   limit 1;
  if _uid is null then
    return false;
  end if;

  -- They already signed themselves up here: free_agents_one_per_user would
  -- refuse the link. Same choice the claim function makes — leave both.
  if exists (
    select 1 from free_agents fa
     where fa.competition_id = _row.competition_id and fa.user_id = _uid
  ) then
    return false;
  end if;

  update free_agents set user_id = _uid, updated_at = now()
   where id = _row.id;

  if _row.placed_team_id is not null then
    insert into team_members (team_id, user_id, role)
    values (_row.placed_team_id, _uid, 'player')
    on conflict (team_id, user_id) do nothing;
  end if;

  return true;
end;
$$;
--> statement-breakpoint

comment on function public.link_free_agent_account is
  'Organizer-side claim_free_agent_signups for one row: link a drafted player to the existing account with their email, and join the roster if placed. Returns whether it linked.';
--> statement-breakpoint

revoke all on function public.link_free_agent_account(uuid) from public;
--> statement-breakpoint
grant execute on function public.link_free_agent_account(uuid) to authenticated;
