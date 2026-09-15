-- A drafted player is a player, on the public page as everywhere else.
--
-- `competition_player_names` answers "who plays for this team" for the public
-- league page and for team-wide player stats. It reads `team_members` and
-- pending `team_invites`, and misses the third way somebody gets onto a team
-- entirely: being DRAFTED.
--
-- `team_members.user_id` is NOT NULL, so a person without an account cannot be
-- a row in it — which is not an oversight but the reason the draft records its
-- result on `free_agents.placed_team_id` instead. `place_free_agents` writes a
-- `team_members` row only when the player happens to have an account.
--
-- Big Shoots is the live case: four teams, six drafted players each, a
-- completed draft, and `competition_player_names` returning ZERO. The public
-- page for that league lists no players at all, and a team-wide stats league in
-- the same shape would show an empty table. `lib/queries/lineups.ts` already
-- takes the union for exactly this reason; this brings the database's own
-- answer into line with it.

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
    -- Claimed accounts: the display name only. Every account has one, so there
    -- is no case where this needs to fall back to anything.
    select tm.team_id, tm.user_id, u.display_name, false
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

revoke all on function public.competition_player_names(uuid) from public;
--> statement-breakpoint

grant execute on function public.competition_player_names(uuid) to anon, authenticated;
--> statement-breakpoint

comment on function public.competition_player_names(uuid) is
  'Who plays for each team, by name only: claimed accounts, unclaimed invites, and drafted free agents. Names never emails — this is readable by signed-out visitors.';
