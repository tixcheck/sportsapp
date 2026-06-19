  create or replace function public.can_view_competition(_competition_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from competitions c
      where c.id = _competition_id
        and (
          c.visibility = 'public'
          or public.is_org_member(c.org_id)
          or public.is_competition_admin(c.id)   -- ← org-organizers + per-competition helpers
          or exists (
            select 1 from teams t
            join team_members tm on tm.team_id = t.id
            where t.competition_id = c.id and tm.user_id = auth.uid()
          )
        )
    );
  $$;