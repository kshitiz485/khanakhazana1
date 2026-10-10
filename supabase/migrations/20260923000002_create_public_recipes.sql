create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  author text not null default 'community',
  image_url text not null default '',
  image_alt text not null default '',
  cooking_time integer not null default 30,
  servings integer not null default 1,
  scalable boolean not null default true,
  tags text[] not null default '{}',
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  recipe_notes jsonb not null default '[]'::jsonb,
  content text not null default '',
  status text not null default 'published' check (status in ('draft', 'published', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.recipes enable row level security;

create policy "Recipes are viewable by everyone"
on public.recipes
for select
using (status = 'published');

create policy "Anyone can insert recipe draft submissions"
on public.recipes
for insert
with check (true);

create or replace function public.set_public_recipes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists public_recipes_updated_at on public.recipes;
create trigger public_recipes_updated_at
before update on public.recipes
for each row execute procedure public.set_public_recipes_updated_at();
