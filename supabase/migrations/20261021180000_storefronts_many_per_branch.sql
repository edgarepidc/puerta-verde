-- A branch can publish more than one zone. Each zone keeps its own slug.
alter table public.storefronts drop constraint if exists storefronts_branch_unique;
