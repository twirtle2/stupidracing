create table if not exists public.horse_profiles (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  asset_id bigint not null,
  name text,
  description text,
  season int not null default 1,
  stats jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (wallet_address, asset_id, season)
);

create table if not exists public.team_entries (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  asset_ids bigint[] not null,
  season int not null default 1,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.race_results (
  id uuid primary key default gen_random_uuid(),
  season int not null default 1,
  wallet_address text,
  team_asset_ids bigint[],
  match_id text,
  winner_asset_id bigint,
  log jsonb,
  created_at timestamp with time zone not null default now()
);

alter table public.horse_profiles enable row level security;
alter table public.team_entries enable row level security;
alter table public.race_results enable row level security;

create policy "horse_profiles_public_read"
  on public.horse_profiles for select
  using (true);

create policy "horse_profiles_public_write"
  on public.horse_profiles for insert
  with check (true);

create policy "horse_profiles_public_update"
  on public.horse_profiles for update
  using (true)
  with check (true);

create policy "team_entries_public_read"
  on public.team_entries for select
  using (true);

create policy "team_entries_public_write"
  on public.team_entries for insert
  with check (true);

create policy "race_results_public_read"
  on public.race_results for select
  using (true);

create policy "race_results_public_write"
  on public.race_results for insert
  with check (true);
