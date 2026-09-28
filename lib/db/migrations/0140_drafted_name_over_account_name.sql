-- A drafted player is listed under the name they were drafted as.
--
-- Big Shoots, 2026-09-28: "Jack Sullivan" was drafted onto Team 4 and later
-- linked an account he had named "CeliacJack". From then on the league showed
-- CeliacJack — on the lineup screen, in the saved lineups, in the stats — and
-- "Jake Schuller" became "Schulaher", "Mike Fleming" became "Mike". The
-- organizer's name for a player in their own league is the one the league
-- should use; the account name is whatever somebody typed at sign-up.
--
-- `competition_player_names` (0120) lists a claimed account by its display
-- name. This is 0120 unchanged except for that branch, which now prefers the
-- player's drafted name on the same team and falls back to the display name
-- for everybody who was never drafted — a team-registration league reads
-- exactly as before.
--
-- The app's own roster (`getTeamRosters`) and absence recording were changed to
-- the same rule in the same commit, so the lineups stop storing account names.

create or replace function public.competition_player_names(
  _competition_id uuid
)
returns table (team_id uuid, user_id uuid, name text, pending boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Mirrors the `competitions_select` policy. SECURITY DEFINER bypasses RLS,
  -- so the visibility rule has to be restated here rather than relied upon —
  -- getting this wrong would publish the roster of a private competition.
  if not exists (
    select 1 from competitions c
    where c.id = _competition_id
      and (
        c.visibility = 'public'
        or public.is_competition_admin(c.id)
        or public.is_org_member(c.org_id)
        or exists (
          select 1 from teams t
          join team_members tm on tm.team_id = t.id
          where t.competition_id = c.id and tm.user_id = auth.uid()
        )
      )
  ) then
    return;
  end if;

  return query
    -- Claimed accounts. The drafted name when the organizer drafted them onto
    -- this team (0140); otherwise the display name, which every account has.
    select tm.team_id, tm.user_id,
           coalesce(
             (select nullif(btrim(fa.name), '')
                from free_agents fa
               where fa.placed_team_id = tm.team_id
                 and fa.user_id = tm.user_id
                 and fa.status <> 'withdrawn'
               limit 1),
             u.display_name
           ),
           false
      from team_members tm
      join teams t on t.id = tm.team_id
      join users u on u.id = tm.user_id
     where t.competition_id = _competition_id
       and coalesce(btrim(u.display_name), '') <> ''
    union all
    -- Roster spots whose invite was never claimed. The organizer typed this
    -- name when they registered the team, and for a pairs league it is usually
    -- already half the team's name. A blank one is skipped rather than being
    -- replaced by the invitee's email.
    select ti.team_id, null::uuid, ti.name, true
      from team_invites ti
      join teams t on t.id = ti.team_id
     where t.competition_id = _competition_id
       and ti.status = 'pending'
       and coalesce(btrim(ti.name), '') <> ''
    union all
    -- Drafted onto a team. NOT `pending`: an invite nobody answered is a maybe,
    -- while these people were put on a side by the organizer and are turning up
    -- on the night.
    --
    -- Placed only. Somebody sitting in the free-agent pool has not joined a
    -- team, and publishing their name would expose a sign-up rather than a
    -- roster — the same threshold every other branch here uses.
    --
    -- The NOT EXISTS keeps a drafted player who DOES have an account from being
    -- listed twice, since `place_free_agents` will already have given them a
    -- `team_members` row.
    select fa.placed_team_id, fa.user_id, fa.name, false
      from free_agents fa
      join teams t on t.id = fa.placed_team_id
     where t.competition_id = _competition_id
       and fa.status <> 'withdrawn'
       and coalesce(btrim(fa.name), '') <> ''
       and not exists (
         select 1 from team_members tm
          where tm.team_id = fa.placed_team_id
            and tm.user_id = fa.user_id
       );
end;
$$;
--> statement-breakpoint

comment on function public.competition_player_names(uuid) is
  'Who plays for each team, by name only: claimed accounts (under their drafted name when drafted), unclaimed invites, and drafted free agents. Names never emails — this is readable by signed-out visitors.';
