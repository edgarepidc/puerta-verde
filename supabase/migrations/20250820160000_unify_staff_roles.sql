-- Unify org_admin into branch_manager (Administrador).
-- Keep enum value org_admin for Postgres compatibility; app no longer uses it.

update public.staff_memberships
set role = 'branch_manager'
where role = 'org_admin';

create or replace function public.is_org_admin(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_memberships sm
    where sm.user_id = auth.uid()
      and sm.organization_id = target_org_id
      and sm.status = 'active'
      and sm.role in ('owner', 'org_admin', 'branch_manager')
  );
$$;

-- Remap org_admin → branch_manager inside organizations.settings.permissions JSON.
update public.organizations
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb),
  '{permissions}',
  (
    select coalesce(jsonb_object_agg(key, cleaned_roles), '{}'::jsonb)
    from (
      select
        perm.key,
        (
          select coalesce(jsonb_agg(to_jsonb(role_name) order by ord), '[]'::jsonb)
          from (
            select distinct
              case when role_el = 'org_admin' then 'branch_manager' else role_el end as role_name,
              case
                when role_el in ('owner', 'org_admin') then 1
                when role_el = 'branch_manager' then 2
                when role_el = 'staff' then 3
                else 9
              end as ord
            from jsonb_array_elements_text(perm.value) as role_el
            where role_el in ('owner', 'org_admin', 'branch_manager', 'staff')
          ) roles
        ) as cleaned_roles
      from jsonb_each(coalesce(settings->'permissions', '{}'::jsonb)) as perm(key, value)
      where jsonb_typeof(perm.value) = 'array'
    ) mapped
  )
)
where settings ? 'permissions';
