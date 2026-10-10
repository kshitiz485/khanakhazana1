grant delete on public.recipes to authenticated;

drop policy if exists "Only the site owner can delete recipes" on public.recipes;
create policy "Only the site owner can delete recipes"
on public.recipes
for delete
to authenticated
using (
  lower((select auth.jwt() ->> 'email')) = 'kshitiz6000@gmail.com'
);
