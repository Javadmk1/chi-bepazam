-- چی بپزم؟ — Supabase schema
-- Apply in the Supabase SQL Editor. All user-owned rows are isolated by RLS.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ingredient_name text not null check (length(trim(ingredient_name)) between 1 and 120),
  quantity numeric(12,3) not null default 1 check (quantity >= 0),
  unit text not null check (length(trim(unit)) between 1 and 24),
  expires_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, ingredient_name)
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ingredient_name text not null check (length(trim(ingredient_name)) between 1 and 120),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text not null check (length(trim(unit)) between 1 and 24),
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_date date not null,
  meal_type text not null check (length(trim(meal_type)) between 1 and 32),
  recipe_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  diet text not null default 'همه',
  allergies jsonb not null default '[]'::jsonb check (jsonb_typeof(allergies) = 'array'),
  household_size integer not null default 2 check (household_size between 1 and 30),
  weekly_budget numeric(14,2) not null default 0 check (weekly_budget >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists pantry_items_user_updated_idx on public.pantry_items(user_id, updated_at);
create index if not exists shopping_items_user_updated_idx on public.shopping_items(user_id, updated_at);
create index if not exists meal_plan_items_user_date_idx on public.meal_plan_items(user_id, meal_date);

drop trigger if exists pantry_items_updated_at on public.pantry_items;
create trigger pantry_items_updated_at before update on public.pantry_items
for each row execute function public.set_updated_at();
drop trigger if exists shopping_items_updated_at on public.shopping_items;
create trigger shopping_items_updated_at before update on public.shopping_items
for each row execute function public.set_updated_at();
drop trigger if exists meal_plan_items_updated_at on public.meal_plan_items;
create trigger meal_plan_items_updated_at before update on public.meal_plan_items
for each row execute function public.set_updated_at();
drop trigger if exists user_preferences_updated_at on public.user_preferences;
create trigger user_preferences_updated_at before update on public.user_preferences
for each row execute function public.set_updated_at();

alter table public.pantry_items enable row level security;
alter table public.shopping_items enable row level security;
alter table public.meal_plan_items enable row level security;
alter table public.user_preferences enable row level security;

drop policy if exists "Users manage their pantry" on public.pantry_items;
create policy "Users manage their pantry" on public.pantry_items
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their shopping list" on public.shopping_items;
create policy "Users manage their shopping list" on public.shopping_items
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their meal plan" on public.meal_plan_items;
create policy "Users manage their meal plan" on public.meal_plan_items
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage their preferences" on public.user_preferences;
create policy "Users manage their preferences" on public.user_preferences
for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.pantry_items to authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;
grant select, insert, update, delete on public.meal_plan_items to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;

-- Never put the service_role key in the mobile app. Use only the publishable/anon key
-- with authenticated user sessions; RLS above is the data boundary.
