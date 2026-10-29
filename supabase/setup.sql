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
