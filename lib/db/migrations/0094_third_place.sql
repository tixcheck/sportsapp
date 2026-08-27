-- Advance the LOSER of a semi-final into the 3rd-place game.
--
-- The Big Shoots playoff is "1 plays 4 and 2 plays 3 in a best of 3, then the
-- winners play and the losers play". Every bracket match until now has been
-- reached by winning, so `place_bracket_winner` only ever walked upward: the
-- winner of (r, p) goes to (r+1, ceil(p/2)). Nothing placed a loser anywhere.
--
-- The 3rd-place game sits in the FINAL round at position 2, beside the final at
-- position 1. That keeps it inside the existing tree — same competition, same
-- track, no new table and no new column — while being the one match whose teams
-- arrive by losing. Semi position 1's loser takes the home side and position
-- 2's the away side, mirroring the odd/even rule the winners already follow, so
-- the bracket reads consistently.
--
-- Guarded on the match actually existing: a bracket generated without a
-- 3rd-place game updates zero rows and behaves exactly as before.

create or replace function public.place_bracket_winner(
    _match_id uuid,
    _winner_team_id uuid
  )
  returns void language plpgsql security definer set search_path = public as $$
  declare
    m record;
    parent_pos int;
    loser_id uuid;
    final_round int;
  begin
    if not public.can_enter_score(_match_id) then
      raise exception 'not authorized to advance this match';
    end if;

    select competition_id, round, bracket_position, bracket_track,
           home_team_id, away_team_id, status
      into m from matches where id = _match_id;

    if not found or m.bracket_position is null or m.status <> 'completed' then
      return;
    end if;
    if _winner_team_id is null
       or (_winner_team_id is distinct from m.home_team_id
           and _winner_team_id is distinct from m.away_team_id) then
      raise exception 'winner must be one of the match teams';
    end if;

    parent_pos := (m.bracket_position + 1) / 2;
    if (m.bracket_position % 2) = 1 then
      update matches set home_team_id = _winner_team_id
        where competition_id = m.competition_id
          and round = m.round + 1
          and bracket_position = parent_pos
          and bracket_track is not distinct from m.bracket_track;
    else
      update matches set away_team_id = _winner_team_id
        where competition_id = m.competition_id
          and round = m.round + 1
          and bracket_position = parent_pos
          and bracket_track is not distinct from m.bracket_track;
    end if;

    -- The 3rd-place game, when this track has one.
    --
    -- Only the two semi-finals feed it, so this is scoped to the round directly
    -- below the last one. `final_round` is read from the data rather than
    -- computed from a team count, because byes leave the tree's shape as the
    -- only reliable statement of how many rounds there are.
    select max(round) into final_round
      from matches
      where competition_id = m.competition_id
        and bracket_position is not null
        and bracket_track is not distinct from m.bracket_track;

    if final_round is null or m.round <> final_round - 1 then
      return;
    end if;
    -- Only positions 1 and 2 are semi-finals; a larger round is an earlier one.
    if m.bracket_position not in (1, 2) then
      return;
    end if;

    loser_id := case
      when _winner_team_id is not distinct from m.home_team_id
        then m.away_team_id
      else m.home_team_id
    end;
    if loser_id is null then
      return;
    end if;

    if m.bracket_position = 1 then
      update matches set home_team_id = loser_id
        where competition_id = m.competition_id
          and round = final_round
          and bracket_position = 2
          and bracket_track is not distinct from m.bracket_track;
    else
      update matches set away_team_id = loser_id
        where competition_id = m.competition_id
          and round = final_round
          and bracket_position = 2
          and bracket_track is not distinct from m.bracket_track;
    end if;
  end;
  $$;
