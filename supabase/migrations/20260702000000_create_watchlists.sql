create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbols text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watchlists_user_id_unique unique (user_id)
);

alter table public.watchlists enable row level security;

create policy "Users can read own watchlist"
  on public.watchlists for select
  using (auth.uid() = user_id);

create policy "Users can insert own watchlist"
  on public.watchlists for insert
  with check (auth.uid() = user_id);

create policy "Users can update own watchlist"
  on public.watchlists for update
  using (auth.uid() = user_id);

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger watchlists_updated_at
  before update on public.watchlists
  for each row
  execute function public.handle_updated_at();
