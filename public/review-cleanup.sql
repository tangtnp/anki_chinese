-- Safe to run again on an existing Hanzi Flow database.
-- Keep 90 days of successfully applied reviews. Never remove pending/conflict rows.
alter table public.reviews add column if not exists applied_at timestamptz;
-- Existing applied reviews get a full retention window starting at migration time.
update public.reviews set applied_at = now()
where status = 'applied' and applied_at is null;

create or replace function public.track_review_applied_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.status = 'applied' then
    if TG_OP = 'UPDATE' then
      if old.status = 'applied' and old.applied_at is not null then
        new.applied_at := old.applied_at;
      else
        new.applied_at := now();
      end if;
    else
      new.applied_at := now();
    end if;
  else
    new.applied_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists reviews_applied_at on public.reviews;
create trigger reviews_applied_at before insert or update on public.reviews
for each row execute function public.track_review_applied_at();

create index if not exists reviews_cleanup on public.reviews(user_id, applied_at)
where status = 'applied';

-- Invoker privileges and RLS keep cleanup confined to the signed-in user's rows.
-- A bounded batch keeps regular sync fast even after a long absence.
create or replace function public.cleanup_applied_reviews()
returns integer language sql security invoker set search_path = pg_catalog as $$
  with expired as (
    select user_id, id from public.reviews
    where user_id = (select auth.uid())
      and status = 'applied'
      and applied_at < now() - interval '90 days'
    order by applied_at, id
    limit 5000
  ), removed as (
    delete from public.reviews r using expired e
    where r.user_id = e.user_id and r.id = e.id
    returning r.id
  )
  select count(*)::integer from removed;
$$;
revoke all on function public.cleanup_applied_reviews() from public, anon;
grant execute on function public.cleanup_applied_reviews() to authenticated;
