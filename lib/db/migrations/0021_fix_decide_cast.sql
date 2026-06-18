-- Fix: a CASE of text literals must be cast to the enum type when assigned to
-- an enum column (Postgres has no implicit text->enum cast in that context).

create or replace function public.decide_organizer_request(
  _request_id uuid,
  _approve boolean,
  _note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _req organizer_requests%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  select * into _req from organizer_requests where id = _request_id;
  if not found then raise exception 'request not found'; end if;
  if _req.status is distinct from 'pending' then
    raise exception 'request already decided';
  end if;

  update organizer_requests
    set status = (case when _approve then 'approved' else 'denied' end)::organizer_request_status,
        decided_at = now(),
        decided_by = _uid,
        note = coalesce(_note, note)
    where id = _request_id;

  update users
    set organizer_status = (case when _approve then 'approved' else 'none' end)::organizer_status
    where id = _req.user_id;
end;
$$;