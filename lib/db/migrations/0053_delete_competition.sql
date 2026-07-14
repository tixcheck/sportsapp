-- Let an org owner/admin permanently delete a competition — a test event, one
-- that never launched, or a cancellation. Every competition_id FK cascades, so
-- this wipes the competition's teams, schedule, scores, pools, and settings in
-- one shot. Gated to org owner/admin (is_competition_org_admin), not per-
-- competition co-organizers, given how destructive it is.
create or replace function public.delete_competition(_competition_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_competition_org_admin(_competition_id) then
    raise exception 'not authorized to delete this competition';
  end if;
  delete from competitions where id = _competition_id;
end;
$$;
--> statement-breakpoint
grant execute on function public.delete_competition(uuid) to authenticated;
