 create or replace function public.list_competition_admins(_competition_id uuid)
  returns table (user_id uuid, email text, display_name text)
  language sql stable security definer set search_path = public as $$
    select u.id, u.email, u.display_name
    from competition_admins ca
    join users u on u.id = ca.user_id
    where ca.competition_id = _competition_id
      and public.is_competition_org_admin(_competition_id)
    order by u.email;
  $$;
  --> statement-breakpoint
  grant execute on function public.list_competition_admins(uuid) to authenticated;