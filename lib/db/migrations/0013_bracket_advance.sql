-- Phase 8: bracket auto-advance.
--
-- When a bracket match completes, the winner fills the next round's open slot.
-- The scorer is usually a captain, not an admin, and the parent match's teams
-- aren't theirs — so they can't update it under normal RLS. This SECURITY
-- DEFINER function does the privileged parent write, but only after checking the
-- caller may score the completed (child) match. The winner is computed in TS
-- (single source: matchWinner) and passed in; here we just validate + place it.
-- Parent of (round r, position p) is (r+1, ceil(p/2)); odd p -> home slot, even
-- p -> away. No parent (the final) -> updates nothing, i.e. crowns the champion.

create or replace function public.place_bracket_winner(
  _match_id uuid,
  _winner_team_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  m record;
  parent_pos int;
begin
  if not public.can_enter_score(_match_id) then
    raise exception 'not authorized to advance this match';
  end if;

  select competition_id, round, bracket_position, home_team_id, away_team_id, status
    into m
    from matches
    where id = _match_id;

  -- Only completed bracket matches advance.
  if not found or m.bracket_position is null or m.status <> 'completed' then
    return;
  end if;
  if _winner_team_id is null
     or (_winner_team_id is distinct from m.home_team_id
         and _winner_team_id is distinct from m.away_team_id) then
    raise exception 'winner must be one of the match teams';
  end if;

  parent_pos := (m.bracket_position + 1) / 2; -- integer ceil for 1-based slots
  if (m.bracket_position % 2) = 1 then
    update matches set home_team_id = _winner_team_id
      where competition_id = m.competition_id
        and round = m.round + 1
        and bracket_position = parent_pos;
  else
    update matches set away_team_id = _winner_team_id
      where competition_id = m.competition_id
        and round = m.round + 1
        and bracket_position = parent_pos;
  end if;
end;
$$;
--> statement-breakpoint
grant execute on function public.place_bracket_winner(uuid, uuid) to authenticated;