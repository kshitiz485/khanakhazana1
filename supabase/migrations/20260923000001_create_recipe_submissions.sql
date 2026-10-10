create table if not exists public.recipe_submissions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.recipe_submissions enable row level security;

create policy "Anyone can submit a recipe for review"
on public.recipe_submissions
for insert
with check (true);

create policy "Users can view their own submitted recipes"
on public.recipe_submissions
for select
using (false);
