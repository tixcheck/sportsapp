-- Brackets belong to a division.
--
-- Summer Forever (Beach Barbiez, Sat Sep 19 2026) runs Mens 12 and Womens 12 in
-- ONE competition, and the organizer wants a 12-team single-elim bracket for
-- each — seeds 1-4 on byes, everybody in. That is impossible today:
-- generateBracketAction deletes EVERY bracket match in the competition before
-- inserting, and a bracket slot is identified by
-- (bracket_track, round, bracket_position), which is competition-scoped and
-- division-blind. Generating the Womens bracket would wipe the Mens one,
-- finished scores and all.
--
-- Two narrow changes.
--
-- 1. matches.division_id. Nullable and deliberately NOT backfilled: only
--    bracket rows ever set it, so every existing pool and league match keeps
--    null and behaves exactly as before. A pool match's division is already
--    reachable through pool_id, so there is nothing to migrate and nothing that
--    reads this column today can change behaviour.
--
-- 2. place_bracket_winner gains the division predicate everywhere it walks the
--    tree. It matched the parent slot on (competition_id, round + 1,
--    bracket_position, bracket_track), so two brackets in one competition wrote
--    into each other. That was already latent for Championship/Consolation —
--    POUNDTOWN, this same organizer's last event, has championship R2P1 and
--    consolation R2P1 side by side, and escaped only because that bracket was
--    generated and never advanced.
--
-- This function carries forward everything 0094 and 0099 added, unchanged in
-- behaviour: the placement early-return, first-round losers dropping into the
-- placement round, and the 3rd-place game. `final_round` is now scoped by
-- division too — it reads max(round) from the data, and without that predicate
-- it would measure the sibling division's tree.

alter table matches
  add column if not exists division_id uuid
    references divisions(id) on delete set null;
--> statement-breakpoint

create index if not exists matches_division_bracket_idx
  on matches (competition_id, division_id, bracket_position);
--> statement-breakpoint

comment on column matches.division_id is
  'Bracket matches only: which division''s bracket this slot belongs to. Null for pool/league matches (their division comes from pool_id) and for a competition with one bracket.';
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

  select competition_id, round, bracket_position, bracket_track, division_id,
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
        and bracket_track is not distinct from m.bracket_track
        and division_id is not distinct from m.division_id;
  else
    update matches set away_team_id = _winner_team_id
      where competition_id = m.competition_id
        and round = m.round + 1
        and bracket_position = parent_pos
        and bracket_track is not distinct from m.bracket_track
        and division_id is not distinct from m.division_id;
  end if;

  loser_id := case
    when _winner_team_id is not distinct from m.home_team_id
      then m.away_team_id
    else m.home_team_id
  end;

  -- First-round losers drop into the placement round, when one exists (0099).
  -- Mirrors the winner's route exactly: same parent position, same odd/even
  -- side. Updates nothing on a bracket that has no placement games.
  if m.round = 1 and loser_id is not null then
    if (m.bracket_position % 2) = 1 then
      update matches set home_team_id = loser_id
        where competition_id = m.competition_id
          and round = 1
          and bracket_position = parent_pos
          and bracket_track = 'placement'
          and division_id is not distinct from m.division_id;
    else
      update matches set away_team_id = loser_id
        where competition_id = m.competition_id
          and round = 1
          and bracket_position = parent_pos
          and bracket_track = 'placement'
          and division_id is not distinct from m.division_id;
    end if;
  end if;

  -- The 3rd-place game, when this track has one (migration 0094).
  --
  -- `final_round` is read from the data rather than computed from a team count,
  -- because byes leave the tree's shape as the only reliable statement of how
  -- many rounds there are. Placement games are excluded from that measurement —
  -- they are a parallel set of fixtures, not a deeper tree, and counting them
  -- would move the final. Scoped by division for the same reason: the sibling
  -- division's tree is not this tree.
  select max(round) into final_round
    from matches
    where competition_id = m.competition_id
      and bracket_position is not null
      and bracket_track is not distinct from m.bracket_track
      and division_id is not distinct from m.division_id;

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
        and bracket_track is not distinct from m.bracket_track
        and division_id is not distinct from m.division_id;
  else
    update matches set away_team_id = loser_id
      where competition_id = m.competition_id
        and round = final_round
        and bracket_position = 2
        and bracket_track is not distinct from m.bracket_track
        and division_id is not distinct from m.division_id;
  end if;
end;
$$;
--> statement-breakpoint

comment on function public.place_bracket_winner(uuid, uuid) is
  'Advance a completed bracket match: winner into its parent slot, first-round loser into the placement round, semi-final loser into the 3rd-place game — all within the same division and track.';
