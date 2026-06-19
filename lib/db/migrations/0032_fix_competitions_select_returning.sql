alter policy competitions_select on public.competitions
    using (
      visibility = 'public'
      or public.is_org_member(org_id)
      or public.is_competition_admin(id)
      or exists (
        select 1 from public.teams t
        join public.team_members tm on tm.team_id = t.id
        where t.competition_id = competitions.id
          and tm.user_id = auth.uid()
      )
    );