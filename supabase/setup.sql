-- Run once in your Supabase project's SQL editor. No service-role key is needed.
create table if not exists public.cards (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null,
 data jsonb not null,
 updated_at timestamptz not null default now(),
 primary key (user_id,id)
);
create table if not exists public.reviews (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 card_id text not null,
 rating integer not null check (rating between 1 and 4),
 expected_reps integer not null check (expected_reps >= 0),
 expected_fingerprint text,
 reviewed_at timestamptz not null,
 elapsed_ms integer not null default 0 check(elapsed_ms between 0 and 600000),
 status text not null default 'pending' check (status in ('pending','applied','conflict')),
 message text,
 primary key(user_id,id),
 foreign key(user_id,card_id) references public.cards(user_id,id) on delete cascade
);
create index if not exists reviews_pending on public.reviews(user_id,status,reviewed_at);
alter table public.cards enable row level security;
alter table public.reviews enable row level security;
drop policy if exists own_cards on public.cards;
create policy own_cards on public.cards for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists own_reviews on public.reviews;
create policy own_reviews on public.reviews for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.cards, public.reviews to authenticated;
revoke all on public.cards,public.reviews from anon;

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
