-- Games played for position, and a route for the teams that lose early.
--
-- Helix run a league playoff where losing your first game does not end your
-- night: the four beaten quarter-finalists play each other in the same wave the
-- semi-finals run in, and the teams outside the top eight play a consolation of
-- their own. Everybody gets two games on playoff night, which is the whole
-- reason the format exists — half a field driving to a gym for one game is how
-- a league loses them.
--
-- Neither of those is a knockout tree. The championship half is, and stays a
-- `championship` bracket. The rest becomes a third track, `placement`: real
-- fixtures with courts, times and scores, but no round above them, so the
-- bracket view must never try to crown a winner from one.
--
-- The genuinely new mechanism is routing a LOSER. Every bracket match until now
-- was reached by winning; `place_bracket_winner` only ever walked up the tree.
-- The bronze game (migration 0094) was the first exception and hard-coded the
-- semi-finals. This generalises it: a first-round loser drops into the
-- placement round mirroring where their winner went.
--
--   championship (1, p)  winner -> championship (2, ceil(p/2))
--                        loser  -> placement    (1, ceil(p/2))
--
-- Same arithmetic, same odd/even home-away rule, so the two halves of the night
-- read consistently. Guarded on the placement match existing, so an ordinary
-- tournament bracket updates nothing and behaves exactly as before.

alter type "bracket_track" add value if not exists 'placement';
--> statement-breakpoint

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

    -- A placement game has no round above it. It is the end of that team's
    -- playoff, so there is nothing to advance and nothing to work out.
    if m.bracket_track = 'placement' then
      return;
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

    loser_id := case
      when _winner_team_id is not distinct from m.home_team_id
        then m.away_team_id
      else m.home_team_id
    end;

    -- First-round losers drop into the placement round, when one exists.
    -- Mirrors the winner's route exactly: same parent position, same odd/even
    -- side. Updates nothing on a bracket that has no placement games.
    if m.round = 1 and loser_id is not null then
      if (m.bracket_position % 2) = 1 then
        update matches set home_team_id = loser_id
          where competition_id = m.competition_id
            and round = 1
            and bracket_position = parent_pos
            and bracket_track = 'placement';
      else
        update matches set away_team_id = loser_id
          where competition_id = m.competition_id
            and round = 1
            and bracket_position = parent_pos
            and bracket_track = 'placement';
      end if;
    end if;

    -- The 3rd-place game, when this track has one (migration 0094).
    --
    -- `final_round` is read from the data rather than computed from a team
    -- count, because byes leave the tree's shape as the only reliable
    -- statement of how many rounds there are. Placement games are excluded
    -- from that measurement — they are a parallel set of fixtures, not a
    -- deeper tree, and counting them would move the final.
    select max(round) into final_round
      from matches
      where competition_id = m.competition_id
        and bracket_position is not null
        and bracket_track is not distinct from m.bracket_track;

    if final_round is null or m.round <> final_round - 1 then
      return;
    end if;
    if m.bracket_position not in (1, 2) then
      return;
    end if;
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
