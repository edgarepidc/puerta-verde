-- Platform super-admin and globally unique branch slugs

alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

create unique index if not exists idx_branches_slug_global
  on public.branches (slug);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_platform_admin
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

grant execute on function public.is_platform_admin() to authenticated;

do $$ begin
  create policy "platform admin read organizations"
    on public.organizations
    for select to authenticated
    using (public.is_platform_admin());
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create policy "platform admin read branches"
    on public.branches
    for select to authenticated
    using (public.is_platform_admin());
exception
  when duplicate_object then null;
end $$;

update public.profiles
set is_platform_admin = true
where id in (
  select id from auth.users where email = 'admin@puertaverde.com'
);
