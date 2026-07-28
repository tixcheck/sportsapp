-- Fix: team captains couldn't invite teammates.
--
-- The only INSERT/UPDATE policy on team_invites (0004_team_invites_rls) is
-- scoped to competition admins via is_competition_admin(). But the teammate
-- invite flow (inviteTeammateAction) is authorized for a team's CAPTAIN too —
-- and a captain is not a competition admin. So a captain's insert tripped RLS:
--   "new row violates row-level security policy for table team_invites".
--
-- Add a captain-scoped policy mirroring the app-layer check: a user may manage
-- invites for a team they captain. Tightly scoped to their own team; the admin
-- policy still covers organizers.

create policy "team_invites_captain_all" on "team_invites"
  for all to authenticated
  using (
    exists (
      select 1 from teams t
      where t.id = team_invites.team_id
        and t.captain_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from teams t
      where t.id = team_invites.team_id
        and t.captain_user_id = auth.uid()
    )
  );
